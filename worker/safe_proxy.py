"""Browser egress proxy. Resolve once, validate ALL answers, connect to a pinned IP.
HTTP and CONNECT only; denies nonstandard ports, private addresses and oversized headers.
"""
import asyncio
import ipaddress
import logging
import socket
from urllib.parse import urlsplit

class UnsafeTarget(ValueError):
    pass

log = logging.getLogger(__name__)

def proxy_response_status(exc):
    if isinstance(exc, UnsafeTarget):
        return 403
    if isinstance(exc, socket.gaierror):
        return 502
    if isinstance(exc, asyncio.TimeoutError):
        return 504
    return 502

def proxy_error_response(exc):
    status = proxy_response_status(exc)
    reason = {403: 'Forbidden', 502: 'Bad Gateway', 504: 'Gateway Timeout'}[status]
    return f'HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'.encode()

def is_public(address):
    ip = ipaddress.ip_address(address)
    return ip.is_global and not ip.is_multicast and not getattr(ip, 'ipv4_mapped', None) and not (ip.version == 6 and (ip.sixtofour or ip.teredo))

async def resolve_public(host, port):
    if port not in (80, 443):
        raise UnsafeTarget('Nonstandard port blocked')
    answers = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    ips = list(dict.fromkeys(a[4][0] for a in answers))
    if not ips or not all(is_public(ip) for ip in ips):
        raise UnsafeTarget('Non-public target blocked')
    # Prefer IPv4 because many container hosts do not have working IPv6 egress.
    # Keep every validated answer so connect_public can fall back safely.
    return sorted(ips, key=lambda address: ipaddress.ip_address(address).version != 4)

async def connect_public(host, port):
    last_error = None
    for ip in await resolve_public(host, port):
        try:
            return await asyncio.wait_for(asyncio.open_connection(ip, port), 10)
        except (OSError, asyncio.TimeoutError) as exc:
            last_error = exc
            log.warning('Outbound crawl connection failed over IPv%d; trying the next validated address', ipaddress.ip_address(ip).version)
    if last_error:
        raise last_error
    raise OSError('No public target address available')

async def pipe(reader, writer):
    try:
        while chunk := await asyncio.wait_for(reader.read(65536), 35):
            writer.write(chunk)
            await writer.drain()
    except (ConnectionError, asyncio.TimeoutError):
        pass
    finally:
        writer.close()

async def handle(reader, writer):
    upstream = None
    try:
        header = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 10)
        if len(header) > 16384:
            raise UnsafeTarget('Header too large')
        method, target, _ = header.split(b'\r\n', 1)[0].decode('ascii').split(' ', 2)
        if method == 'CONNECT':
            host, port = target.rsplit(':', 1)
            host, port = host.strip('[]'), int(port)
            if port != 443:
                raise UnsafeTarget('CONNECT restricted to TLS')
        else:
            parsed = urlsplit(target)
            if parsed.scheme != 'http' or parsed.username or parsed.password or not parsed.hostname:
                raise UnsafeTarget('Invalid HTTP target')
            host, port = parsed.hostname, parsed.port or 80
        remote_reader, upstream = await connect_public(host, port)
        if method == 'CONNECT':
            writer.write(b'HTTP/1.1 200 Connection Established\r\n\r\n')
        else:
            path = parsed.path or '/'
            if parsed.query:
                path += '?' + parsed.query
            # Rebuild authority headers; never forward attacker-controlled Host or proxy headers.
            lines = header.split(b'\r\n')[1:]
            kept = [line for line in lines if line and line.split(b':', 1)[0].lower() not in (b'host', b'proxy-authorization', b'proxy-connection', b'connection')]
            rebuilt = f'{method} {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n'.encode() + b'\r\n'.join(kept) + b'\r\n\r\n'
            upstream.write(rebuilt)
            await upstream.drain()
        await writer.drain()
        tasks = [asyncio.create_task(pipe(reader, upstream)), asyncio.create_task(pipe(remote_reader, writer))]
        done, pending = await asyncio.wait(tasks, timeout=65, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    except UnsafeTarget as exc:
        # Keep crawler-facing errors generic, but preserve the safe policy reason in
        # worker logs so Dokploy can distinguish a blocked target from a proxy outage.
        log.warning('Blocked outbound crawl request: %s', str(exc))
        try:
            writer.write(proxy_error_response(exc))
            await writer.drain()
        except ConnectionError:
            pass
    except socket.gaierror as exc:
        log.warning('Outbound crawl proxy could not resolve the target hostname')
        try:
            writer.write(proxy_error_response(exc))
            await writer.drain()
        except ConnectionError:
            pass
    except asyncio.TimeoutError as exc:
        log.warning('Outbound crawl proxy timed out connecting to the target')
        try:
            writer.write(proxy_error_response(exc))
            await writer.drain()
        except ConnectionError:
            pass
    except Exception as exc:
        log.warning('Outbound crawl proxy failed: %s', type(exc).__name__)
        try:
            writer.write(proxy_error_response(exc))
            await writer.drain()
        except ConnectionError:
            pass
    finally:
        if upstream:
            upstream.close()
        writer.close()

async def start_proxy():
    return await asyncio.start_server(handle, '127.0.0.1', 8899, limit=20000)
