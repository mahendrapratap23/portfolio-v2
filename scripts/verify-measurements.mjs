import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/sagar/.gemini/antigravity-ide/brain/c876926b-1d3e-4955-9741-72dfbd5bddcd';
const PORT = 9222;
const TARGET_URL = 'http://localhost:4173/';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const measurementCode = `(() => {
  const sections = [
    { id: 'sec-hero', nextId: 'sec-about' },
    { id: 'sec-about', nextId: 'sec-skills' },
    { id: 'sec-skills', nextId: 'sec-work' },
    { id: 'sec-work', nextId: 'sec-projects' },
    { id: 'sec-projects', nextId: 'sec-hello' }
  ];

  const results = [];
  for (const { id, nextId } of sections) {
    const sec = document.getElementById(id);
    const nextSec = document.getElementById(nextId);
    if (!sec || !nextSec) continue;

    let lastEl = sec.lastElementChild;
    while (lastEl && (lastEl.tagName === 'CANVAS' || lastEl.tagName === 'SVG' && lastEl.classList.contains('paper-plane-trail'))) {
      lastEl = lastEl.previousElementSibling;
    }
    if (id === 'sec-hero') {
      lastEl = sec.querySelector('.portrait-container') || sec.querySelector('.hero-layout');
    } else if (id === 'sec-skills') {
      lastEl = sec.querySelector('.row') || sec.querySelector('.skills-ecosystem-container');
    } else if (id === 'sec-work') {
      lastEl = sec.querySelector('.timeline-wrapper');
    } else if (id === 'sec-projects') {
      lastEl = sec.querySelector('.project-grid');
    }

    const nextHeading = nextSec.querySelector('h2') || nextSec.firstElementChild;

    const lastRect = lastEl.getBoundingClientRect();
    const nextRect = nextHeading.getBoundingClientRect();

    const dist = Math.round(nextRect.top - lastRect.bottom);
    results.push({
      from: id,
      to: nextId,
      fromBottom: Math.round(lastRect.bottom),
      toTop: Math.round(nextRect.top),
      distancePx: dist,
      pass72px: dist <= 72
    });
  }

  const s = getComputedStyle(document.documentElement);
  const spaceSection = s.getPropertyValue('--space-section').trim();
  const spaceBlock = s.getPropertyValue('--space-block').trim();

  return { results, spaceSection, spaceBlock };
})()`;

const touchTestCode = `(() => {
  // Simulate tap
  window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, clientY: 300, pointerType: 'touch', bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, clientY: 300, pointerType: 'touch', bubbles: true }));

  // Simulate vertical swipe (scroll)
  window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 200, pointerType: 'touch', bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 205, clientY: 250, pointerType: 'touch', bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: 205, clientY: 250, pointerType: 'touch', bubbles: true }));

  // Simulate horizontal drag
  window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 400, pointerType: 'touch', bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 160, clientY: 410, pointerType: 'touch', bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: 160, clientY: 410, pointerType: 'touch', bubbles: true }));

  return { success: true };
})()`;

const letGoCode = `(() => {
  const btn = document.getElementById('g');
  if (btn) {
    btn.click();
    return { clicked: true, pressed: btn.getAttribute('aria-pressed') };
  }
  return { clicked: false };
})()`;

const letterPositionsCode = `(() => {
  const letters = Array.from(document.querySelectorAll('.l')).slice(0, 10);
  return letters.map(l => ({
    char: l.textContent,
    transform: l.style.transform
  }));
})()`;

async function run() {
  console.log('1. Launching headless Google Chrome...');
  const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now()
  ], { stdio: 'ignore' });

  let versionData = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch (e) {
      // wait
    }
    await sleep(200);
  }

  if (!versionData) {
    console.error('Failed to connect to Chrome remote debugging port.');
    chromeProc.kill();
    process.exit(1);
  }

  console.log('Connected to Chrome:', versionData.Browser);

  const newTargetRes = await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
  const targetInfo = await newTargetRes.json();
  const wsUrl = targetInfo.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  let messageId = 1;
  const pendingRequests = new Map();
  const consoleMessages = [];

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map(a => a.value || a.description).join(' ');
      consoleMessages.push({ type: data.params.type, text });
    }
  };

  await new Promise((resolve) => { ws.onopen = resolve; });

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCommand('Page.enable');
  await sendCommand('Runtime.enable');
  await sendCommand('DOM.enable');

  // --- 1. DESKTOP VIEW (1440 x 900) ---
  console.log('\n2. Testing Desktop View (1440 x 900)...');
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });
  await sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });
  await sendCommand('Page.navigate', { url: TARGET_URL });
  await sleep(2500);

  const desktopEval = await sendCommand('Runtime.evaluate', {
    expression: measurementCode,
    returnByValue: true
  });
  console.log('\n--- 1440px Desktop Section Distance Measurements ---');
  console.log('Tokens: --space-section =', desktopEval.result.value.spaceSection, '--space-block =', desktopEval.result.value.spaceBlock);
  console.table(desktopEval.result.value.results);

  const desktopScreenshotRes = await sendCommand('Page.captureScreenshot', { format: 'png' });
  const desktopScreenshotPath = path.join(ARTIFACT_DIR, 'desktop_1440px_view.png');
  fs.writeFileSync(desktopScreenshotPath, Buffer.from(desktopScreenshotRes.data, 'base64'));
  console.log('Saved desktop screenshot to:', desktopScreenshotPath);

  // --- 2. MOBILE VIEW (390 x 844) ---
  console.log('\n3. Testing Mobile View (390 x 844, touch = true)...');
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });
  await sendCommand('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 5
  });
  await sendCommand('Page.navigate', { url: TARGET_URL });
  await sleep(2500);

  const mobileEval = await sendCommand('Runtime.evaluate', {
    expression: measurementCode,
    returnByValue: true
  });
  console.log('\n--- 390px Mobile Section Distance Measurements ---');
  console.log('Tokens: --space-section =', mobileEval.result.value.spaceSection, '--space-block =', mobileEval.result.value.spaceBlock);
  console.table(mobileEval.result.value.results);

  const mobileScreenshotRes = await sendCommand('Page.captureScreenshot', { format: 'png' });
  const mobileScreenshotPath = path.join(ARTIFACT_DIR, 'mobile_390px_view.png');
  fs.writeFileSync(mobileScreenshotPath, Buffer.from(mobileScreenshotRes.data, 'base64'));
  console.log('Saved mobile screenshot to:', mobileScreenshotPath);

  // --- 3. TEST TOUCH GESTURES ---
  console.log('\n4. Testing Mobile Touch Gestures (Tap, Vertical Swipe, Horizontal Drag)...');
  await sendCommand('Runtime.evaluate', { expression: touchTestCode, returnByValue: true });
  await sleep(500);

  // --- 4. TEST GRAVITY ---
  console.log('\n5. Testing "let go" button for Letter Physics...');
  const letGoRes = await sendCommand('Runtime.evaluate', { expression: letGoCode, returnByValue: true });
  console.log('Gravity "let go" result:', letGoRes.result.value);
  await sleep(1500);

  const letterPositions = await sendCommand('Runtime.evaluate', { expression: letterPositionsCode, returnByValue: true });
  console.log('Sample letter positions after gravity:', letterPositions.result.value.slice(0, 5));

  const gravityScreenshotRes = await sendCommand('Page.captureScreenshot', { format: 'png' });
  const gravityScreenshotPath = path.join(ARTIFACT_DIR, 'mobile_gravity_view.png');
  fs.writeFileSync(gravityScreenshotPath, Buffer.from(gravityScreenshotRes.data, 'base64'));
  console.log('Saved gravity screenshot to:', gravityScreenshotPath);

  // Console Errors
  console.log('\n--- Console Logs ---');
  const errors = consoleMessages.filter(m => m.type === 'error');
  const warnings = consoleMessages.filter(m => m.type === 'warning');
  console.log(`Console Errors: ${errors.length}, Warnings: ${warnings.length}`);
  if (errors.length > 0) {
    console.error('Errors:', errors);
  }

  ws.close();
  chromeProc.kill();
  console.log('\nVerification script completed successfully.');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
