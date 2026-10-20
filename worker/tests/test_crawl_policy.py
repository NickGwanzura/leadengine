"""End-to-end crawl policy tests against a real local fixture website.

The fixture site is an aiohttp server on loopback. These exercise the same HTTP calls
the worker makes for each approved page, without Crawl4AI or the browser.
"""
import asyncio
import contextlib
import sys
from pathlib import Path

import pytest
from aiohttp import ClientSession, ClientTimeout, web

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from policy import MAX_HTML_BYTES, fetch_approved_page, robots_allowed
from safe_proxy import UnsafeTarget

DISALLOW_ALL = 'User-agent: *\nDisallow: /\n'
ALLOW_ALL = 'User-agent: *\nAllow: /\n'
PAGE = '<html><head><title>Fixture</title></head><body><a href="/page">Home</a></body></html>'


def build_site():
    """Build the fixture application and its mutable state."""
    state = {'robots': 'deny', 'hits': []}
    app = web.Application()

    async def robots(request):
        if state['robots'] == 'missing':
            return web.Response(status=404)
        if state['robots'] == 'unavailable':
            return web.Response(status=500)
        return web.Response(text=DISALLOW_ALL if state['robots'] == 'deny' else ALLOW_ALL, content_type='text/plain')

    async def page(request):
        return web.Response(text=PAGE, content_type='text/html')

    async def near_limit(request):
        return web.Response(body=b'<html>' + b'x' * (1_900_000 - 6), content_type='text/html')

    async def redirect(request):
        raise web.HTTPFound('/page')

    async def private(request):
        return web.Response(status=403, text='forbidden')

    async def missing(request):
        return web.Response(status=404, text='not found', content_type='text/html')

    async def binary(request):
        return web.Response(body=b'%PDF-1.4', content_type='application/pdf')

    async def huge(request):
        return web.Response(body=b'<html>' + b'x' * MAX_HTML_BYTES, content_type='text/html')

    async def track(request):
        state['hits'].append(request.path)
        return web.Response(status=404)

    app.router.add_get('/robots.txt', robots)
    app.router.add_get('/page', page)
    app.router.add_get('/near-limit', near_limit)
    app.router.add_get('/go', redirect)
    app.router.add_get('/private', private)
    app.router.add_get('/missing', missing)
    app.router.add_get('/binary', binary)
    app.router.add_get('/huge', huge)
    app.router.add_get('/{tail:.*}', track)
    return app, state


@contextlib.asynccontextmanager
async def fixture_site():
    app, state = build_site()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', 0)
    await site.start()
    try:
        yield f'http://127.0.0.1:{runner.addresses[0][1]}', state
    finally:
        await runner.cleanup()


def run(check):
    """Run ``check(url, state, session)`` against a freshly started fixture site."""
    async def main():
        async with fixture_site() as (url, state):
            async with ClientSession(timeout=ClientTimeout(total=10), trust_env=False) as session:
                return await check(url, state, session)
    return asyncio.run(main())


def test_robots_denial_blocks_the_approved_page():
    async def check(url, state, session):
        assert await robots_allowed(session, f'{url}/page') is False
    run(check)


def test_missing_robots_txt_allows_the_page():
    async def check(url, state, session):
        state['robots'] = 'missing'
        assert await robots_allowed(session, f'{url}/page') is True
    run(check)


def test_unavailable_robots_txt_is_refused_conservatively():
    async def check(url, state, session):
        state['robots'] = 'unavailable'
        assert await robots_allowed(session, f'{url}/page') is False
    run(check)


def test_allowed_robots_txt_permits_the_page():
    async def check(url, state, session):
        state['robots'] = 'allow'
        assert await robots_allowed(session, f'{url}/page') is True
    run(check)


def test_redirect_is_refused_and_never_followed():
    async def check(url, state, session):
        with pytest.raises(UnsafeTarget) as error:
            await fetch_approved_page(session, f'{url}/go')
        assert str(error.value) == 'REDIRECT_REQUIRES_APPROVED_FINAL_URL'
        assert '/page' not in state['hits']
    run(check)


@pytest.mark.parametrize('path, code', [
    ('/private', 'ACCESS_RESTRICTED'),
    ('/binary', 'HTML_REQUIRED'),
    ('/huge', 'PAGE_TOO_LARGE'),
])
def test_unsafe_responses_are_refused(path, code):
    async def check(url, state, session):
        with pytest.raises(UnsafeTarget) as error:
            await fetch_approved_page(session, f'{url}{path}')
        assert str(error.value) == code
    run(check)


def test_broken_page_returns_status_without_html_for_the_caller():
    async def check(url, state, session):
        assert await fetch_approved_page(session, f'{url}/missing') == (404, None)
    run(check)


def test_html_page_is_returned_for_extraction():
    async def check(url, state, session):
        status, html = await fetch_approved_page(session, f'{url}/page')
        assert status == 200
        assert 'Fixture' in html
    run(check)


def test_large_page_under_the_limit_is_returned_in_full():
    async def check(url, state, session):
        status, html = await fetch_approved_page(session, f'{url}/near-limit')
        assert status == 200
        assert len(html) == 1_900_000
    run(check)
