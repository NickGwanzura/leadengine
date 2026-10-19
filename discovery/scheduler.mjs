const sectors = ['Industrial', 'FMCG', 'Logistics', 'Health', 'Tech', 'Real Estate'];
const base = process.env.APP_INTERNAL_URL || 'http://app:3000';
const secret = process.env.INTERNAL_API_SECRET;
if (!secret || secret.length < 32) throw new Error('INTERNAL_API_SECRET is required');
const day = 24 * 60 * 60 * 1000;
const retryDelay = 15 * 60 * 1000;

async function cycle() {
  let failures = 0;
  for (const sector of sectors) {
    try {
      const response = await fetch(`${base}/api/discovery/auto`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ sector }),
        signal: AbortSignal.timeout(75_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      console.log(JSON.stringify({ sector, result: result.results }));
    } catch (error) {
      failures++;
      console.error(JSON.stringify({ sector, error: error instanceof Error ? error.message : 'Search failed' }));
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return failures;
}

while (true) {
  const failures = await cycle();
  const delay = failures ? retryDelay : day;
  console.log(JSON.stringify({ cycleComplete: true, failures, nextRunAt: new Date(Date.now() + delay).toISOString() }));
  await new Promise(resolve => setTimeout(resolve, delay));
}
