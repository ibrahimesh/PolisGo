// Lighthouse-style lab numbers for the production build: Slow 4G-ish network
// (150 ms RTT, 1.6 Mbps down) and 4x CPU slowdown, cold cache.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const frontend = process.argv[2];
const require = createRequire(`${frontend}/package.json`);
const { chromium } = require('playwright');

const server = spawn('npx', ['vite', 'preview', '--port', '3000', '--strictPort'], { cwd: frontend, shell: true });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes('3000') && resolve());
  setTimeout(() => reject(new Error('preview did not start')), 30000);
});

const browser = await chromium.launch();
try {
  for (const [label, path, width] of [['landing desktop', '/', 1440], ['landing phone', '/', 390], ['login phone', '/login', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const bytes = { script: 0, font: 0, stylesheet: 0, other: 0 };
    let requests = 0;
    page.on('response', async (r) => {
      requests++;
      const type = r.request().resourceType();
      const len = Number((await r.allHeaders())['content-length'] ?? (await r.body().catch(() => Buffer.alloc(0))).length);
      bytes[type in bytes ? type : 'other'] += len;
    });
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' });
    const m = await page.evaluate(() => new Promise((resolve) => {
      let lcp = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      let cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
        resolve({ fcp, lcp, cls });
      }, 1500);
    }));
    const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
    console.log(`${label.padEnd(16)} FCP ${(m.fcp / 1000).toFixed(2)} s  LCP ${(m.lcp / 1000).toFixed(2)} s  CLS ${m.cls.toFixed(3)}  requests ${requests}  JS ${kb(bytes.script)}  fonts ${kb(bytes.font)}  CSS ${kb(bytes.stylesheet)}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
  spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { shell: true });
}
