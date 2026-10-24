import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const origin = args.find(value => value.startsWith('--url='))?.slice(6) ?? 'http://127.0.0.1:5173';
const output = resolve(args.find(value => value.startsWith('--out='))?.slice(6) ?? '/private/tmp/cringestone-performance');
const seconds = Number(args.find(value => value.startsWith('--seconds='))?.slice(10) ?? 12);
const deviceScaleFactor = Number(args.find(value => value.startsWith('--dpr='))?.slice(6) ?? 2);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: !headed, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const results = [];
try {
  for (const [width, height] of [[1440, 900], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/tests/performance/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => window.__cringestonePerf?.ready && window.__cringestonePerf.completions > 0, null, { timeout: 120_000 });
    await page.bringToFront();
    for (const effects of [false, true]) {
      await page.evaluate(enabled => window.__cringestonePerf.setEffects(enabled), effects);
      await page.waitForTimeout(2400);
      const measurement = await page.evaluate(duration => new Promise(resolveMeasurement => {
        const intervals = [];
        let previous = 0;
        let start = 0;
        const frame = time => {
          if (!start) start = time;
          if (previous) intervals.push(time - previous);
          previous = time;
          if (time - start < duration) { requestAnimationFrame(frame); return; }
          const sorted = [...intervals].sort((a, b) => a - b);
          const sum = intervals.reduce((total, value) => total + value, 0);
          const canvas = document.querySelector('canvas');
          const gl = canvas.getContext('webgl2');
          const info = gl.getExtension('WEBGL_debug_renderer_info');
          resolveMeasurement({
            frames: intervals.length, elapsedMs: time - start, averageFps: intervals.length / sum * 1000,
            medianFrameMs: sorted[Math.floor(sorted.length * .5)], p95FrameMs: sorted[Math.floor(sorted.length * .95)], p99FrameMs: sorted[Math.floor(sorted.length * .99)],
            framesOver33ms: intervals.filter(value => value > 33.4).length,
            renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
            drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], userAgent: navigator.userAgent,
            animationCompletions: window.__cringestonePerf.completions,
          });
        };
        requestAnimationFrame(frame);
      }), seconds * 1000);
      const name = `${width}x${height}-${effects ? 'effects' : 'idle'}`;
      await page.screenshot({ path: `${output}/${name}.png` });
      const result = { name, headed, viewport: { width, height }, deviceScaleFactor, effects, ...measurement, errors: [...errors] };
      results.push(result);
      console.log(JSON.stringify(result));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ measuredAt: new Date().toISOString(), note: 'rAF cadence in a full-board scene; not a universal device guarantee. Harness is not imported by production.', results }, null, 2));
}
