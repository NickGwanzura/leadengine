const base = process.env.APP_INTERNAL_URL || 'http://app:3000';
const secret = process.env.INTERNAL_API_SECRET;
if (!secret || secret.length < 32) throw new Error('INTERNAL_API_SECRET is required');
// Each tick asks the app to run the most overdue search target, so leads arrive around the clock
// instead of in one daily burst. DISCOVERY_REFRESH_HOURS (app side) controls how often each target repeats.
const tickMs = Math.max(1, Number(process.env.DISCOVERY_INTERVAL_MINUTES) || 10) * 60 * 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForApp() {
  let attempts = 0;
  while (true) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) {
        if (attempts) console.log(JSON.stringify({ service: 'discovery-scheduler', event: 'app-ready' }));
        return;
      }
    } catch { /* The app may still be starting. */ }
    attempts++;
    if (attempts % 12 === 0) console.warn(JSON.stringify({ service: 'discovery-scheduler', event: 'waiting-for-app' }));
    await sleep(5_000);
  }
}

async function autoAudit() {
  try {
    const response = await fetch(`${base}/api/internal/auto-audit`, { method: 'POST', headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    const queued = (result.results || []).reduce((sum, item) => sum + (item.queued || 0), 0);
    if (queued) console.log(JSON.stringify({ service: 'auto-audit', at: new Date().toISOString(), queued }));
  } catch (error) {
    console.error(JSON.stringify({ service: 'auto-audit', error: error instanceof Error ? error.message : 'Queueing failed' }));
  }
}

async function morningBrief() {
  try {
    const response = await fetch(`${base}/api/internal/morning-brief`, { method: 'POST', headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(120_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    if (result.sent) console.log(JSON.stringify({ service: 'morning-brief', at: new Date().toISOString(), sent: result.sent }));
  } catch (error) {
    console.error(JSON.stringify({ service: 'morning-brief', error: error instanceof Error ? error.message : 'Brief failed' }));
  }
}

async function tick() {
  try {
    const response = await fetch(`${base}/api/discovery/auto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ next: true }),
      signal: AbortSignal.timeout(150_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    // Only log ticks that searched or failed; idle ticks are the normal state between due targets.
    const active = (result.results || []).filter(item => !item.idle && !item.paused);
    if (active.length) console.log(JSON.stringify({ service: 'discovery-scheduler', at: new Date().toISOString(), results: active }));
  } catch (error) {
    console.error(JSON.stringify({ service: 'discovery-scheduler', error: error instanceof Error ? error.message : 'Search failed' }));
  }
}

console.log(JSON.stringify({ service: 'discovery-scheduler', event: 'started', tickMinutes: tickMs / 60000 }));
while (true) {
  await waitForApp();
  await tick();
  await autoAudit();
  await morningBrief();
  await sleep(tickMs);
}
