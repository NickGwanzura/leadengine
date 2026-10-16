import asyncio
import socket
import sys
from pathlib import Path
from unittest.mock import patch
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from safe_proxy import is_public, resolve_public, UnsafeTarget, proxy_error_response

@pytest.mark.parametrize('ip', ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','172.16.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1','2002:7f00:1::'])
def test_private_blocked(ip):
    assert not is_public(ip)

@pytest.mark.parametrize('ip', ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])
def test_public_allowed(ip):
    assert is_public(ip)

def test_mixed_dns_answers_blocked():
    async def run():
        loop = asyncio.get_running_loop()
        async def answers(*args, **kwargs):
            return [(2,1,6,'',('1.1.1.1',443)), (2,1,6,'',('127.0.0.1',443))]
        with patch.object(loop, 'getaddrinfo', answers):
            with pytest.raises(UnsafeTarget):
                await resolve_public('example.test',443)
    asyncio.run(run())

def test_nonstandard_port_blocked():
    with pytest.raises(UnsafeTarget):
        asyncio.run(resolve_public('example.test',8080))

def test_proxy_errors_keep_policy_and_network_failures_distinct():
    assert proxy_error_response(UnsafeTarget('Non-public target blocked')).startswith(b'HTTP/1.1 403 Forbidden')
    assert proxy_error_response(socket.gaierror()).startswith(b'HTTP/1.1 502 Bad Gateway')
    assert proxy_error_response(asyncio.TimeoutError()).startswith(b'HTTP/1.1 504 Gateway Timeout')
