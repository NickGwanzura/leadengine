import { spawn } from 'node:child_process';

const children = new Set();
let stopping = false;
let restartTimer;

function start(command, args, environment = process.env) {
  const child = spawn(command, args, { env: environment, stdio: 'inherit' });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function startScheduler() {
  if (stopping) return;
  const scheduler = start(process.execPath, ['scheduler.mjs'], {
    ...process.env,
    APP_INTERNAL_URL: 'http://127.0.0.1:3000',
  });
  scheduler.once('exit', (code, signal) => {
    if (stopping) return;
    console.error(JSON.stringify({ service: 'discovery-scheduler', event: 'exited', code, signal, retrySeconds: 60 }));
    restartTimer = setTimeout(startScheduler, 60_000);
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  for (const child of children) child.kill(signal);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const server = start(process.execPath, ['server.js']);
server.once('exit', (code, signal) => {
  const expected = stopping;
  shutdown('SIGTERM');
  console.error(JSON.stringify({ service: 'app', event: 'exited', code, signal }));
  process.exit(expected || code === 0 ? 0 : 1);
});
startScheduler();
