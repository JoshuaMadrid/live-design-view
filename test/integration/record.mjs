// Records the VS Code window by streaming its own rendered frames over the Chromium DevTools
// protocol (no OS screen capture, so no menu bar / Dock / other apps, and no permission needed).
// Usage: node record.mjs <port> <outDir>   — stops when <outDir>/stop exists.
import fs from 'node:fs';
import path from 'node:path';

const [port, out] = process.argv.slice(2);
fs.mkdirSync(path.join(out, 'f'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 120 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page' && /workbench/.test(t.url));
  } catch {}
  if (!target) await sleep(500);
}
if (!target) throw new Error('no VS Code window on port ' + port);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
let n = 0;
const times = fs.createWriteStream(path.join(out, 'times.txt'));
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method !== 'Page.screencastFrame') return;
  const { data, metadata, sessionId } = m.params;
  const name = `f/${String(++n).padStart(6, '0')}.jpg`;
  fs.writeFileSync(path.join(out, name), Buffer.from(data, 'base64'));
  times.write(`${metadata.timestamp} ${name}\n`);
  send('Page.screencastFrameAck', { sessionId });
});
send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
fs.writeFileSync(path.join(out, 'recording'), String(Date.now()));
while (!fs.existsSync(path.join(out, 'stop'))) await sleep(200);
send('Page.stopScreencast');
await sleep(500);
times.end();
ws.close();
console.log('frames', n);
