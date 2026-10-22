import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CHORDS, palmCenter } from '../src/gestures.js';
import { pose } from '../tests/fixtures/hand.js';

const url = process.env.APP_URL || 'http://localhost:5173';
const browser = await chromium.launch({
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader'],
});
await mkdir('test-results', { recursive: true });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1120 }, permissions: ['camera'] });
  const page = await context.newPage();
  // Test-only instrumentation. First run real video inference unchanged, then
  // substitute geometric fixtures at the Worker boundary to exercise app wiring.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__testFrameCount = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          if (event.data.type !== 'result') return;
          window.__testFrameCount++;
          window.__testMetricOutput = Array.isArray(event.data.worldLandmarks);
          if (window.__testPose) Object.assign(event.data, window.__testPose);
        });
      }
    };
  });
  const errors = [], requests = [];
  const audioSource = await readFile(new URL('../src/audio.js', import.meta.url), 'utf8');
  await page.route(`${url}/__test/audio.js`, route => route.fulfill({ contentType: 'text/javascript', body: audioSource }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(url);
  await page.locator('#start-camera').waitFor();
  assert.equal(await page.locator('.chord-card').count(), 5);
  assert.equal(await page.locator('button.chord-card').count(), 0);
  await page.keyboard.press('3');
  assert.equal(await page.locator('#current-chord').textContent(), '—');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.locator('#help-toggle').click();
  assert.equal(await page.locator('#help-panel').isVisible(), true);
  await page.locator('#help-toggle').click();
  await page.locator('#start-camera').click();
  await page.waitForFunction(() => document.querySelector('#mode-tag').textContent === '手势模式' || !document.querySelector('#notice').hidden, null, { timeout: 55_000 });
  assert.equal(await page.locator('#mode-tag').textContent(), '手势模式', await page.locator('#notice').textContent());
  await page.waitForFunction(() => parseInt(document.querySelector('#fps').textContent) > 0, null, { timeout: 20_000 }).catch(async error => {
    console.error(JSON.stringify({ pageErrors: errors, state: await page.evaluate(() => ({ mode: document.querySelector('#mode-tag').textContent, notice: document.querySelector('#notice').textContent, frames: window.__testFrameCount, visibility: document.visibilityState })) }));
    throw error;
  });
  results.push({ check: 'real MediaPipe worker + fake webcam frames', fps: await page.locator('#fps').textContent(), roundTrip: await page.locator('#latency').textContent() });
  assert.equal(await page.evaluate(() => window.__testMetricOutput), true);
  await page.screenshot({ path: 'test-results/camera.png', fullPage: true });

  function backViewFrame(number, strumY) {
    const chord = pose(number, { yaw: 180, pitch: -35, roll: 0, centerX: 0.7 });
    const sweep = pose(0, { yaw: 180, centerX: 0.3 });
    const offset = strumY - palmCenter(sweep.landmarks).y;
    sweep.landmarks = sweep.landmarks.map(p => ({ ...p, y: p.y + offset }));
    // Reverse detection order: pairing must follow the selected hand's index.
    return { landmarks: [sweep.landmarks, chord.landmarks], worldLandmarks: [sweep.worldLandmarks, chord.worldLandmarks], handedness: [[{ categoryName: 'Right', score: 0.99 }], [{ categoryName: 'Left', score: 0.99 }]] };
  }
  await page.evaluate(frame => { window.__testPose = frame; }, backViewFrame(5, 0.3));
  await page.waitForFunction(() => document.querySelector('#current-chord').textContent === 'Dm');
  await page.evaluate(frame => { window.__testPose = frame; }, backViewFrame(5, 0.75));
  await page.waitForFunction(() => document.querySelector('#strum-count').textContent === '1 次扫弦');
  await page.evaluate(frame => { window.__testPose = frame; }, backViewFrame(3, 0.75));
  await page.waitForFunction(() => document.querySelector('#current-chord').textContent === 'Am');
  await page.evaluate(frame => { window.__testPose = frame; }, backViewFrame(0, 0.75));
  await page.waitForFunction(() => document.querySelector('#current-chord').textContent === '休止');
  const beforeMuteSweep = await page.evaluate(frame => { window.__testPose = frame; return window.__testFrameCount; }, backViewFrame(0, 0.3));
  await page.waitForFunction(before => window.__testFrameCount > before + 4, beforeMuteSweep);
  assert.equal(await page.locator('#strum-count').textContent(), '1 次扫弦');
  await page.evaluate(() => { window.__testPose = null; });
  results.push({ check: 'synthetic back-view landmarks drive Dm, downstroke, Am and fist mute, with correct per-hand metric pairing', pass: true });
  await page.evaluate(() => { window.testStream = document.querySelector('video').srcObject; });
  await page.locator('#stop-camera').click();
  assert.equal(await page.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended')), true);
  assert.equal(await page.locator('#current-chord').textContent(), '—');
  await page.locator('#start-camera').click();
  await page.waitForFunction(() => document.querySelector('#mode-tag').textContent === '手势模式', null, { timeout: 55_000 });
  await page.locator('#stop-camera').click();
  results.push({ check: 'stop releases camera and worker; restart succeeds', pass: true });

  const sound = await page.evaluate(async chords => {
    const { GuitarAudio } = await import('/__test/audio.js');
    const audio = new GuitarAudio(); await audio.unlock(); audio.warmup(chords);
    const buffer = audio.makeString(57), data = buffer.getChannelData(0);
    // Autocorrelation near A3=220Hz, avoiding an overtone or octave match.
    const expectedLag = audio.context.sampleRate / 220;
    const begin = Math.round(audio.context.sampleRate * 0.1), end = Math.round(audio.context.sampleRate * 0.45);
    const correlation = lag => {
      let a = 0, b = 0, c = 0;
      for (let i = begin; i < end; i++) { a += data[i] * data[i + lag]; b += data[i] ** 2; c += data[i + lag] ** 2; }
      return a / Math.sqrt(b * c);
    };
    let lag = 0, best = -1;
    for (let n = Math.floor(expectedLag * 0.94); n <= Math.ceil(expectedLag * 1.06); n++) { const value = correlation(n); if (value > best) { best = value; lag = n; } }
    const a = correlation(lag - 1), c = correlation(lag + 1);
    const offset = (a - c) / (2 * (a - 2 * best + c));
    const frequency = audio.context.sampleRate / (lag + offset);
    const played = audio.strum(chords[0], 'down', 0.8), count = audio.voices.size;
    audio.mute(); await audio.context.close();
    return { frequency, cents: 1200 * Math.log2(frequency / 220), finite: data.every(Number.isFinite), peak: data.reduce((max, n) => Math.max(max, Math.abs(n)), 0), played, voices: count };
  }, CHORDS);
  assert.equal(sound.finite, true); assert.ok(sound.peak > 0.1 && sound.peak <= 1); assert.ok(Math.abs(sound.cents) < 12, JSON.stringify(sound));
  assert.equal(sound.played, true); assert.equal(sound.voices, CHORDS[0].midi.length);
  results.push({ check: 'guitar synthesis is non-silent, finite and tuned', ...sound });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.evaluate(() => document.querySelector('#stage').getBoundingClientRect().right <= innerWidth), true);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(requests.some(request => !request.startsWith(url) && !request.startsWith('data:') && !request.startsWith('blob:')), false);
  results.push({ check: '390px layout fits; no uncaught errors or external asset requests', pass: true });

  const denied = await context.newPage();
  await denied.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test denied', 'NotAllowedError'); }; });
  await denied.goto(url); await denied.locator('#start-camera').click();
  await denied.locator('#notice').waitFor();
  assert.match(await denied.locator('#notice').textContent(), /权限未开启/);
  assert.equal(await denied.locator('#start-camera').isEnabled(), true);
  results.push({ check: 'camera permission denial gives recoverable message', pass: true });
  await writeFile('test-results/browser-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
