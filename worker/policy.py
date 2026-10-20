"""Fetch policy for approved public pages.

Kept separate from the crawl loop so the robots, redirect and content rules can be
exercised against a real local fixture site without a browser or Crawl4AI.
"""
import asyncio
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from safe_proxy import UnsafeTarget

USER_AGENT = 'SpiritusLeadOS/0.1 (+authorised public website research)'
MAX_HTML_BYTES = 2_000_000
MAX_ROBOTS_BYTES = 512_000


async def robots_allowed(session, url, proxy=None):
    parts = urlsplit(url)
    robots_url = f'{parts.scheme}://{parts.netloc}/robots.txt'
    async with session.get(robots_url, proxy=proxy, allow_redirects=False) as r:
        if r.status == 404:
            return True
        if r.status != 200:
            return False
        if r.content_length is not None and r.content_length > MAX_ROBOTS_BYTES:
            return False
        content, size = bytearray(), 0
        async for chunk in r.content.iter_chunked(65536):
            size += len(chunk)
            if size > MAX_ROBOTS_BYTES:
                return False
            content.extend(chunk)
        robots = RobotFileParser()
        robots.parse(content.decode('utf-8', errors='replace').splitlines())
        delay = robots.crawl_delay(USER_AGENT) or robots.crawl_delay('*') or 0
        if delay > 10:
            return False  # Conservative refusal rather than exceeding the job deadline.
        if delay:
            await asyncio.sleep(delay)
        return robots.can_fetch(USER_AGENT, url)


async def fetch_approved_page(session, url, proxy=None):
    """Fetch one approved page without following redirects.

    Returns ``(status, html)``. ``html`` is ``None`` for a non-fatal 4xx/5xx, so the
    caller can record a broken internal link. A redirect, restricted access, non-HTML
    response or oversized body raises ``UnsafeTarget`` with the existing error codes.
    """
    async with session.get(url, proxy=proxy, allow_redirects=False) as response:
        if 300 <= response.status < 400:
            # Destination needs separate terms/robots approval.
            raise UnsafeTarget('REDIRECT_REQUIRES_APPROVED_FINAL_URL')
        if response.status in (401, 403, 429):
            raise UnsafeTarget('ACCESS_RESTRICTED')
        if response.status >= 400:
            return response.status, None
        if 'text/html' not in response.headers.get('Content-Type', ''):
            raise UnsafeTarget('HTML_REQUIRED')
        if response.content_length is not None and response.content_length > MAX_HTML_BYTES:
            raise UnsafeTarget('PAGE_TOO_LARGE')
        # read(n) only returns what is buffered, so accumulate until the body ends.
        chunks, size = [], 0
        async for chunk in response.content.iter_chunked(65536):
            size += len(chunk)
            if size > MAX_HTML_BYTES:
                raise UnsafeTarget('PAGE_TOO_LARGE')
            chunks.append(chunk)
        return response.status, b''.join(chunks).decode('utf-8', errors='replace')
