import asyncio
import logging
import os
import time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
import aiohttp
import httpx
from redis.asyncio import Redis
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from safe_proxy import start_proxy, UnsafeTarget
from audit import inspect_page
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
API = os.environ.get('APP_INTERNAL_URL', 'http://app:3000') + '/api/internal/jobs'
SECRET = os.environ['INTERNAL_API_SECRET']
PROXY = 'http://127.0.0.1:8899'
USER_AGENT = 'SpiritusLeadOS/0.1 (+authorised public website research)'

async def callback(client, action, job=None, **data):
    payload = {'action': action, **data}
    if job:
        payload.update(id=job['id'], leaseToken=job['leaseToken'])
    r = await client.post(API, json=payload)
    r.raise_for_status()
    return r.json()

async def robots_allowed(session, url):
    parts = urlsplit(url)
    robots_url = f'{parts.scheme}://{parts.netloc}/robots.txt'
    async with session.get(robots_url, proxy=PROXY, allow_redirects=False) as r:
        if r.status == 404:
            return True
        if r.status != 200:
            return False
        content = await r.content.read(512001)
        if len(content) > 512000:
            return False
        robots = RobotFileParser()
        robots.parse(content.decode('utf-8', errors='replace').splitlines())
        delay = robots.crawl_delay(USER_AGENT) or robots.crawl_delay('*') or 0
        if delay > 10:
            return False  # Conservative refusal rather than exceeding the job deadline.
        if delay:
            await asyncio.sleep(delay)
        return robots.can_fetch(USER_AGENT, url)

async def crawl(client, job):
    browser = BrowserConfig(headless=True, java_script_enabled=False, ignore_https_errors=False, proxy_config={'server': PROXY}, user_agent=USER_AGENT, extra_args=['--proxy-bypass-list=<-loopback>', '--disable-quic', '--disable-background-networking', '--disable-features=WebRtcHideLocalIpsWithMdns', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'])
    pages, findings, pending, seen = [], [], [job['url']], set()
    timeout = aiohttp.ClientTimeout(total=20)
    async with aiohttp.ClientSession(timeout=timeout, headers={'User-Agent': USER_AGENT}, trust_env=False) as session:
        async with AsyncWebCrawler(config=browser) as crawler:
            # Each page is pre-fetched without redirects through the pinning proxy.
            # Browser JS disabled: no form submissions or automated interactions.
            while pending and len(pages) < 3:
                url = pending.pop(0)
                if url in seen or urlsplit(url).hostname != job['approvedDomain']:
                    continue
                seen.add(url)
                if not await robots_allowed(session, url):
                    if not pages:
                        raise UnsafeTarget('ROBOTS_DENIED_OR_UNAVAILABLE')
                    continue
                await callback(client, 'progress', job, progress=10 + len(pages) * 25)
                # Redirects are not followed: destination needs separate terms/robots approval.
                async with session.get(url, proxy=PROXY, allow_redirects=False) as response:
                    if 300 <= response.status < 400:
                        if not pages:
                            raise UnsafeTarget('REDIRECT_REQUIRES_APPROVED_FINAL_URL')
                        continue
                    if response.status in (401, 403, 429):
                        raise UnsafeTarget('ACCESS_RESTRICTED')
                    if response.status >= 400:
                        if pages:
                            findings.append(dict(category='Broken internal link', classification='VERIFIED', observation=f'An internal link returned HTTP {response.status}.', recommendation='Verify the destination and update the link if needed.', sourceUrl=url, evidence={'statusCode': response.status}, confidence=1.0))
                            continue
                        raise UnsafeTarget('HTTP_ERROR')
                    if 'text/html' not in response.headers.get('Content-Type', ''):
                        raise UnsafeTarget('HTML_REQUIRED')
                    data = await response.content.read(2_000_001)
                    if len(data) > 2_000_000:
                        raise UnsafeTarget('PAGE_TOO_LARGE')
                    html = data.decode('utf-8', errors='replace')
                # Crawl4AI parses the approved fetched HTML. The browser never navigates the target,
                # so redirects/subresources cannot escape the robots and network policy.
                clean = BeautifulSoup(html, 'html.parser')
                for tag in clean.find_all(['script', 'style', 'link', 'img', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'base', 'meta']):
                    tag.decompose()
                for tag in clean.find_all(True):
                    for attr in list(tag.attrs):
                        if attr.lower().startswith('on') or attr.lower() in ('src', 'srcset', 'style', 'background'):
                            del tag[attr]
                start = time.monotonic()
                config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=30000, js_only=False)
                result = await crawler.arun(url='raw:' + str(clean), config=config)
                if not result.success:
                    raise RuntimeError('CRAWL4AI_EXTRACTION_FAILED')
                page, observed, links = inspect_page(url, html, response.status, round((time.monotonic()-start)*1000))
                markdown = getattr(result.markdown, 'raw_markdown', result.markdown)
                page['metadata']['crawl4aiContentExcerpt'] = str(markdown or '')[:1500]
                pages.append(page)
                findings.extend(observed)
                # Depth 1 only, bounded queue, no arbitrary crawling of the full domain.
                if len(pages) == 1:
                    pending.extend(links[:2])
                await asyncio.sleep(2)
    await callback(client, 'complete', job, result={'pages': pages, 'findings': findings, 'summary': f'Inspected {len(pages)} approved public HTML pages. Findings describe only observed public evidence. Internal systems, purchase intent and business needs require discovery. JavaScript interactions, mobile layout and Core Web Vitals were not tested.'})

async def run():
    if len(SECRET) < 32:
        raise RuntimeError('INTERNAL_API_SECRET must be at least 32 characters')
    server = await start_proxy()
    redis = Redis.from_url(os.environ.get('REDIS_URL', 'redis://redis:6379'), socket_connect_timeout=5, socket_timeout=8)
    async with server, httpx.AsyncClient(headers={'Authorization': 'Bearer ' + SECRET}, timeout=30, trust_env=False) as client:
        while True:
            job = None
            try:
                job = (await callback(client, 'claim'))['job']
                if not job:
                    try:
                        await redis.brpop('crawl:wakeup', timeout=5)
                    except Exception:
                        await asyncio.sleep(5)
                    continue
                logging.info('Starting job %s attempt %s', job['id'], job['attempt'])
                await asyncio.wait_for(crawl(client, job), 120)
                logging.info('Completed job %s', job['id'])
            except Exception as exc:
                logging.warning('Job operation failed: %s', type(exc).__name__)
                if job:
                    try:
                        # Only classified error codes leave the worker; never HTML or secrets.
                        code = str(exc) if isinstance(exc, UnsafeTarget) else type(exc).__name__.upper()
                        await callback(client, 'fail', job, error=code[:100], retryable=not isinstance(exc, UnsafeTarget))
                    except Exception:
                        pass  # Lease expiry safely recovers interrupted jobs; stale leases cannot commit.
                await asyncio.sleep(3)

if __name__ == '__main__':
    asyncio.run(run())
