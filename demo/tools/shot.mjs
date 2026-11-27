// Screenshot a page with headless Chrome over the DevTools protocol.
// usage: CHROME=<chrome-headless-shell> W=1920 H=1080 node shot.mjs <url> <waitMs> <out.png>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, waitMs, out] = process.argv.slice(2);
const W = Number(process.env.W ?? 1920);
const H = Number(process.env.H ?? 1080);
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(
  process.env.CHROME,
  ['--no-sandbox', '--headless', `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, 'about:blank'],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    await sleep(200);
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg), pending.delete(msg.id);
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(Number(waitMs));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
ws.close();
chrome.kill();
