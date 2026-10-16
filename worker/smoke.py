"""Exercise the live proxy and extraction path without creating a CRM job.

Run inside the worker container: python smoke.py
The example.com domain is reserved for documentation and test examples.
"""

import asyncio
import json

from main import crawl


class Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {}


class CaptureClient:
    def __init__(self):
        self.events = []

    async def post(self, _url, json):
        self.events.append(json)
        return Response()


async def smoke():
    client = CaptureClient()
    job = {
        'id': 'smoke-test',
        'url': 'https://example.com/',
        'approvedDomain': 'example.com',
        'leaseToken': 'smoke-test',
    }
    await asyncio.wait_for(crawl(client, job), timeout=120)
    completed = next((event for event in client.events if event['action'] == 'complete'), None)
    if not completed or not completed['result']['pages']:
        raise RuntimeError('Crawler did not return a completed audit')
    print(json.dumps({
        'status': 'ok',
        'progressEvents': [event['progress'] for event in client.events if event['action'] == 'progress'],
        'pages': len(completed['result']['pages']),
        'findings': len(completed['result']['findings']),
        'title': completed['result']['pages'][0]['title'],
    }))


if __name__ == '__main__':
    asyncio.run(smoke())
