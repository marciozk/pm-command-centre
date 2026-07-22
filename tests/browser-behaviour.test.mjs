import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const chrome = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].find(existsSync);
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function readDebugPort(profile) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); }
    catch { await wait(50); }
  }
  throw new Error('Chrome did not expose its DevTools port.');
}

test('actual browser executes all in-app behavioural checks', { skip: !chrome }, async () => {
  const app = await readFile(new URL('../app/pm-command-centre.html', import.meta.url));
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(app);
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const profile = await mkdtemp(join(tmpdir(), 'pmcc-browser-test-'));
  const browser = spawn(chrome, [
    '--headless', '--no-sandbox', '--no-first-run', '--disable-gpu', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--disable-sync', '--metrics-recording-only', '--mute-audio', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });
  try {
    const debugPort = await readDebugPort(profile);
    const { port } = server.address();
    const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:${port}/`, { method: 'PUT' }).then(response => response.json());
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true });socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(new Error(message.error.message)):resolve(message.result)}});
    const command = (method, params={}) => new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
    await command('Runtime.enable');
    let result='';
    for(let attempt=0;attempt<100&&!result.includes('checks passed');attempt+=1){
      const evaluation=await command('Runtime.evaluate',{expression:"document.querySelector('#pm-check-result')?.textContent || ''",returnByValue:true});
      result=evaluation.result.value||'';
      if(!result.includes('checks passed'))await wait(50);
    }
    assert.equal(result, '13/13 checks passed');
    socket.close();
  } finally {
    browser.kill('SIGKILL');
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});
