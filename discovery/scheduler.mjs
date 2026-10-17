const sectors = ['Industrial', 'FMCG', 'Logistics', 'Health', 'Tech', 'Real Estate'];
const base = process.env.APP_INTERNAL_URL || 'http://app:3000';
const secret = process.env.INTERNAL_API_SECRET;
if (!secret || secret.length < 32) throw new Error('INTERNAL_API_SECRET is required');
const day = 24 * 60 * 60 * 1000;

async function cycle() {
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
      console.error(JSON.stringify({ sector, error: error instanceof Error ? error.message : 'Search failed' }));
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

while (true) {
  await cycle();
  await new Promise(resolve => setTimeout(resolve, day));
}
