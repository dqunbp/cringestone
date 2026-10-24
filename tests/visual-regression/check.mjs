import { chromium, webkit } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PerspectiveCamera, Euler, Quaternion, Vector3 } from 'three';
import { CARDS } from '../../src/core/catalog.ts';

// This probe sees public DOM, pointer coordinates and rendered pixels only.
// Run against a built baseline and a dev fix with separate fresh contexts.
const args = process.argv.slice(2);
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const origin = option('url', 'http://127.0.0.1:5173');
const engine = option('browser', 'chromium');
const output = resolve(option('out', '/private/tmp/cringestone-visual-regression'));
await mkdir(output, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch({
  headless: !args.includes('--headed'),
  ...(engine === 'chromium' && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const failures = [];
const errors = [];
const samples = [];
const frames = [];
const steps = [];
let cdp;
let boardVisibleAt = Infinity;
let lastFrameAt = 0;
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const probe = { changes: [], pointerEvents: [], contextEvents: [], currentLabel: '', startedAt: Date.now() };
  Object.defineProperty(window, '__visualDomProbe', { value: probe });
  new MutationObserver(() => {
    const label = document.querySelector('.card-preview h3')?.textContent ?? '';
    if (label !== probe.currentLabel) {
      probe.currentLabel = label;
      probe.changes.push({ time: Date.now(), label });
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  for (const name of ['webglcontextlost', 'webglcontextrestored']) {
    document.addEventListener(name, () => probe.contextEvents.push({ time: Date.now(), name }), true);
  }
  for (const name of ['pointermove', 'pointerout', 'pointerleave']) {
    document.addEventListener(name, event => {
      if (probe.pointerEvents.length < 1500) probe.pointerEvents.push({
        time: Date.now(), name, x: event.clientX, y: event.clientY,
        target: event.target instanceof Element ? event.target.tagName : '',
      });
    }, true);
  }
  for (const name of ['blur', 'focus']) {
    window.addEventListener(name, () => probe.pointerEvents.push({ time: Date.now(), name }));
  }
});

function project(point, width = 1440, height = 900) {
  const camera = new PerspectiveCamera(43, width / height, .1, 60);
  const narrow = Math.max(1, 1.58 / (width / height));
  camera.position.set(0, 11.3 * narrow, 10.1 * narrow);
  camera.lookAt(0, .2, .45);
  camera.updateMatrixWorld();
  const value = point.project(camera);
  return { x: (value.x + 1) * width / 2, y: (1 - value.y) * height / 2 };
}

async function snapshot(name) {
  const png = await page.screenshot({ path: `${output}/${name}.png` });
  samples.push({ name, time: Date.now(), data: png.toString('base64') });
}

// A near-uniform black board region means the scene disappeared, independent
// of card identity or the random opening. Decode screenshots, never game state.
async function inspectPixels(items) {
  const result = [];
  for (let offset = 0; offset < items.length; offset += 20) {
    result.push(...await page.evaluate(async images => {
      const results = [];
      for (const image of images) {
        const bytes = Uint8Array.from(atob(image.data), character => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes]));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const drawing = canvas.getContext('2d');
        drawing.drawImage(bitmap, 0, 0);
        const width = Math.floor(bitmap.width * .3);
        const height = Math.floor(bitmap.height * .14);
        const pixels = drawing.getImageData(Math.floor(bitmap.width * .35), Math.floor(bitmap.height * .39), width, height).data;
        let dark = 0;
        let total = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const brightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
          total += brightness;
          if (brightness < 5) dark += 1;
        }
        const count = pixels.length / 4;
        results.push({ name: image.name, time: image.time, darkFraction: dark / count, meanBrightness: total / count });
        bitmap.close();
      }
      return results;
    }, items.slice(offset, offset + 20)));
  }
  return result;
}

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  if (engine === 'chromium') {
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Page.screencastFrame', event => {
      // Ack immediately: capture must not backpressure rendering.
      cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
      const time = Date.now();
      if (time - lastFrameAt >= 60 && frames.length < 1200) {
        lastFrameAt = time;
        frames.push({ name: `frame-${frames.length}`, time, data: event.data });
      }
    });
    await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 640, maxHeight: 400, everyNthFrame: 2 });
  }
  await page.getByRole('button', { name: 'Занять место за столом' }).click();
  const keep = page.getByRole('button', { name: 'Оставить карты и начать', exact: true });
  await keep.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector('.loading-table'), undefined, { timeout: 60_000 });
  boardVisibleAt = Date.now();
  await keep.click({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const endTurn = document.querySelector('.end-turn');
    return endTurn && !endTurn.disabled;
  }, undefined, { timeout: 90_000 });
  await page.mouse.move(10, 300);
  await snapshot('first-active-hand');
  await page.waitForTimeout(650);
  await snapshot('settled-first-hand');
  const labels = await page.locator('.hand-buttons button').allTextContents();
  const count = labels.length;
  const logBeforeHover = await page.locator('.battle-log ol').textContent();
  // Public card definitions identify a visible minion so the route covers
  // real attack/health gems as well as text and art, rather than empty paper.
  const minionIndex = labels.findLastIndex(text => Object.values(CARDS).some(card => card.type === 'minion' && text.endsWith(card.name)));
  const index = minionIndex >= 0 ? minionIndex : Math.max(0, count - 2);
  const label = labels[index].replace(/^\s*\d+\s*/, '').trim();
  const center = index - (count - 1) / 2;
  const x = center * Math.min(1.5, 7.4 / Math.max(count - 1, 1));
  const arc = Math.abs(center) ** 2 * .025;
  const resting = project(new Vector3(x, .8 + index * .013, 4.5 + arc));
  await page.mouse.move(resting.x, resting.y);
  await page.waitForTimeout(700);
  const lift = new Vector3(x, 1.8, 3.85 + arc);
  const rotation = new Quaternion().setFromEuler(new Euler(-.87, 0, 0));
  const points = [
    ['art', [0, .4, .09]], ['name', [0, -.14, .11]],
    ['description', [0, -.44, .1]], ['cost', [-.54, .79, .14]],
    ['attack', [-.51, -.83, .14]], ['health', [.51, -.83, .14]],
    ['frame', [.61, .1, .09]],
  ];
  for (const [name, local] of points) {
    const point = project(new Vector3(...local).multiplyScalar(1.16).applyQuaternion(rotation).add(lift));
    const beforeMove = Date.now();
    await page.mouse.move(point.x, point.y, { steps: 12 });
    // Only the initial entry may settle; transitions across the same raised
    // card must preserve the preview during motion as well as while stationary.
    const startedAt = name === 'art' ? Date.now() : beforeMove;
    await page.waitForTimeout(200);
    const earlyLabel = await page.evaluate(() => document.querySelector('.card-preview h3')?.textContent ?? '');
    await snapshot(`hover-${name}-early`);
    await page.waitForTimeout(Math.max(0, 1900 - (Date.now() - startedAt)));
    const lateLabel = await page.evaluate(() => document.querySelector('.card-preview h3')?.textContent ?? '');
    await snapshot(`hover-${name}-late`);
    const endedAt = Date.now();
    const changes = await page.evaluate(({ start, end }) => window.__visualDomProbe.changes.filter(change => change.time >= start && change.time <= end), { start: startedAt, end: endedAt });
    const step = { name, point, startedAt, endedAt, earlyLabel, lateLabel, expectedLabel: label, changes };
    steps.push(step);
    if (earlyLabel !== label || lateLabel !== label || changes.some(change => change.label !== label)) failures.push(`Hover ${name}: expected persistent preview ${label}`);
  }
  const logAfterHover = await page.locator('.battle-log ol').textContent();
  if (logAfterHover !== logBeforeHover) failures.push('Hover changed the public battle log');
  await page.mouse.move(10, 300);
  await page.waitForTimeout(400);
  if (!args.includes('--hover-only')) {
    // First fresh draw adds previously unseen text/materials to the existing scene.
    await page.locator('.end-turn').click();
    await page.waitForFunction(() => {
      const endTurn = document.querySelector('.end-turn');
      return endTurn && !endTurn.disabled;
    }, undefined, { timeout: 90_000 });
    await snapshot('after-first-turn-draw');
  }
  if (cdp) await cdp.send('Page.stopScreencast');
  if (errors.length) failures.push(...errors.map(error => `Page error: ${error}`));
  const dom = await page.evaluate(() => window.__visualDomProbe);
  if (dom.contextEvents.some(event => event.name === 'webglcontextlost')) failures.push('WebGL context lost');
  // Export before decoding screenshots so analysis work cannot pollute the
  // user's diagnostic history with probe-induced frame gaps.
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  const exportButton = page.getByRole('button', { name: 'Скачать диагностику', exact: true });
  let diagnostics = { available: false };
  if (await exportButton.count()) {
    const download = page.waitForEvent('download');
    await exportButton.click();
    await (await download).saveAs(`${output}/diagnostics.json`);
    const downloaded = JSON.parse(await readFile(`${output}/diagnostics.json`, 'utf8'));
    const entries = downloaded.entries ?? [];
    const ready = entries.findIndex(entry => entry.type === 'scene.ready');
    diagnostics = {
      available: true,
      ready: ready >= 0,
      actions: entries.filter(entry => entry.type === 'action.committed').length,
      renderer: entries.find(entry => entry.type === 'scene.mount')?.details?.renderer,
      initialSuspense: entries.filter((entry, index) => entry.type === 'scene.suspense.enter' && index < ready).length,
      runtimeSuspenseAfterReady: entries.filter((entry, index) => entry.type === 'scene.suspense.enter' && index > ready).length,
      contextLosses: entries.filter(entry => entry.type === 'webgl.context.lost').length,
      javascriptErrors: entries.filter(entry => entry.type.startsWith('javascript.')).length,
    };
    if (!diagnostics.ready || !diagnostics.actions || !diagnostics.renderer || !diagnostics.initialSuspense) failures.push('Downloaded diagnostics lack scene.ready, committed actions, renderer, or initial Suspense');
    if (diagnostics.runtimeSuspenseAfterReady || diagnostics.contextLosses || diagnostics.javascriptErrors) failures.push('Downloaded diagnostics contain a runtime suspension, context loss, or JavaScript error');
  }
  const pixelResults = await inspectPixels([...frames, ...samples]);
  const blackFrames = pixelResults.filter(frame => frame.time >= boardVisibleAt && frame.darkFraction > .98);
  if (blackFrames.length) failures.push(`${blackFrames.length} nearly black board frame(s) after scene became visible`);
  const anomalyNames = new Set(blackFrames.slice(0, 12).map(frame => frame.name));
  for (const frame of frames.filter(frame => anomalyNames.has(frame.name))) await writeFile(`${output}/${frame.name}.png`, Buffer.from(frame.data, 'base64'));
  const report = { origin, engine, createdAt: new Date().toISOString(), openingHand: labels, count, inspectedIndex: index, inspectedLabel: label, logBeforeHover, logAfterHover, steps, dom, pixelResults, blackFrames, diagnostics, errors, failures };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ origin, engine, frames: frames.length, screenshots: samples.length, blackFrames: blackFrames.length, diagnostics, failures, report: `${output}/report.json` }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
