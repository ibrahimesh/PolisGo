import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const frontend = process.argv[2];
const { chromium } = createRequire(`${frontend}/package.json`)('playwright');
const server = spawn('npx', ['vite', 'preview', '--port', '3000', '--strictPort'], { cwd: frontend, shell: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('3000') && r()));
const browser = await chromium.launch();
try {
  for (const throttle of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    if (throttle) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 96000 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    const shifts = await page.evaluate(() => new Promise((resolve) => {
      const out = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) out.push({ t: Math.round(e.startTime), v: +e.value.toFixed(3),
        src: (e.sources ?? []).slice(0, 2).map((s) => { const n = s.node; return n ? `${n.nodeName.toLowerCase()}${n.id ? '#' + n.id : ''}.${String(n.className ?? '').split(' ').slice(0, 3).join('.')} "${(n.textContent ?? '').trim().slice(0, 30)}" dy=${Math.round(s.currentRect.y - s.previousRect.y)}` : '(removed)'; }) }); })
        .observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => resolve(out), 1500);
    }));
    console.log(`--- ${throttle ? 'throttled' : 'unthrottled'}: CLS ${shifts.reduce((s, x) => s + x.v, 0).toFixed(3)}`);
    for (const s of shifts.sort((a, b) => b.v - a.v).slice(0, 4)) console.log(`  ${s.t}ms ${s.v}  ${s.src.join(' | ')}`);
    await context.close();
  }
} finally { await browser.close(); spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { shell: true }); }
