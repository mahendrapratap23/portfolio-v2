import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWsUrl(port = 9444) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json();
      const pageTarget = list.find((t) => t.type === 'page' && (t.url.includes('5173') || t.url.includes('4173'))) || list.find((t) => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        return pageTarget.webSocketDebuggerUrl;
      }
    } catch {}
    await wait(200);
  }
  throw new Error('Could not connect to Chrome debugging port');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 1;
    this.pending = new Map();
    this.events = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        } else if (msg.method) {
          const handlers = this.events.get(msg.method) || [];
          for (const h of handlers) h(msg.params);
        }
      };
    });
  }

  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }

  async send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  async screenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${outputPath}`);
  }

  async screenshotClip(outputPath, clip) {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      clip,
      captureBeyondViewport: false,
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${outputPath}`);
  }
}

async function run() {
  console.log('=== VERIFYING REAL WHITE DOT-GRID NOTEBOOK PAGE ===');

  const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9444',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://127.0.0.1:4173',
  ]);

  try {
    const wsUrl = await getWsUrl(9444);
    const client = new CDPClient(wsUrl);
    await client.connect();

    const consoleErrors = [];
    client.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        consoleErrors.push(p.args?.map(a => a.value || a.description).join(' '));
      }
    });
    client.on('Runtime.exceptionThrown', (p) => {
      consoleErrors.push(p.exceptionDetails?.text || 'Uncaught exception');
    });

    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');

    await client.send('Page.navigate', { url: 'http://127.0.0.1:4173' });
    await wait(2000);

    // Measure values in light mode
    await client.evaluate(`document.documentElement.setAttribute('data-theme', 'light')`);
    await wait(500);

    const lightStyles = await client.evaluate(`
      (() => {
        const cs = getComputedStyle(document.documentElement);
        const bodyCs = getComputedStyle(document.body);
        const crease = document.querySelector('.crease-layer');
        const creaseCs = crease ? getComputedStyle(crease) : null;
        const faceSo = document.querySelector('.face .so');
        const faceFill = faceSo ? getComputedStyle(faceSo).fill : null;
        const btn = document.querySelector('button');
        const btnBorder = btn ? getComputedStyle(btn).borderColor : null;
        const mEl = document.querySelector('.m');
        const markerColor = mEl ? getComputedStyle(mEl).color : null;
        return {
          paper: cs.getPropertyValue('--paper').trim(),
          ink: cs.getPropertyValue('--ink').trim(),
          blue: cs.getPropertyValue('--blue').trim(),
          dot: cs.getPropertyValue('--dot').trim(),
          crease: cs.getPropertyValue('--crease').trim(),
          creaseOpacity: creaseCs ? creaseCs.opacity : null,
          bodyBg: bodyCs.backgroundColor,
          faceFill: faceFill,
          btnBorder: btnBorder,
          markerColor: markerColor,
        };
      })()
    `);
    console.log('Light Mode Styles:', lightStyles);

    // Measure values in dark mode
    await client.evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`);
    await wait(500);

    const darkStyles = await client.evaluate(`
      (() => {
        const cs = getComputedStyle(document.documentElement);
        const bodyCs = getComputedStyle(document.body);
        const crease = document.querySelector('.crease-layer');
        const creaseCs = crease ? getComputedStyle(crease) : null;
        const faceSo = document.querySelector('.face .so');
        const faceFill = faceSo ? getComputedStyle(faceSo).fill : null;
        return {
          paper: cs.getPropertyValue('--paper').trim(),
          ink: cs.getPropertyValue('--ink').trim(),
          blue: cs.getPropertyValue('--blue').trim(),
          dot: cs.getPropertyValue('--dot').trim(),
          crease: cs.getPropertyValue('--crease').trim(),
          creaseOpacity: creaseCs ? creaseCs.opacity : null,
          bodyBg: bodyCs.backgroundColor,
          faceFill: faceFill,
        };
      })()
    `);
    console.log('Dark Mode Styles:', darkStyles);

    // Contrast calculations (WCAG relative luminance)
    function hexToRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
    function relLuminance([r, g, b]) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }
    function contrast(rgb1, rgb2) {
      const l1 = relLuminance(rgb1);
      const l2 = relLuminance(rgb2);
      const top = Math.max(l1, l2);
      const bot = Math.min(l1, l2);
      return (top + 0.05) / (bot + 0.05);
    }

    const whiteRgb = [255, 255, 255];
    const inkRgb = hexToRgb(lightStyles.ink); // #1b2340
    const blueRgb = hexToRgb(lightStyles.blue); // #2b3de0
    const dotRgb = hexToRgb(lightStyles.dot); // #c9cedb

    const bodyContrast = contrast(inkRgb, whiteRgb);
    const hintContrast = contrast(blueRgb, whiteRgb);
    const markerContrast = contrast(whiteRgb, blueRgb);
    const dotContrast = contrast(dotRgb, whiteRgb);

    console.log(`\n--- CONTRAST RATIOS (Light Theme) ---`);
    console.log(`Body text (ink ${lightStyles.ink} on white): ${bodyContrast.toFixed(2)}:1 (>= 4.5:1: ${bodyContrast >= 4.5 ? 'PASS' : 'FAIL'})`);
    console.log(`Hint text (blue ${lightStyles.blue} on white): ${hintContrast.toFixed(2)}:1 (>= 4.5:1: ${hintContrast >= 4.5 ? 'PASS' : 'FAIL'})`);
    console.log(`Marker highlight text (white on blue ${lightStyles.blue}): ${markerContrast.toFixed(2)}:1 (>= 4.5:1: ${markerContrast >= 4.5 ? 'PASS' : 'FAIL'})`);
    console.log(`Dot grid (dot ${lightStyles.dot} on white): ${dotContrast.toFixed(2)}:1 (Subtle quiet background)`);

    // Viewport 1: 390px (Mobile)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await wait(500);

    // 390px Light
    await client.evaluate(`document.documentElement.setAttribute('data-theme', 'light')`);
    await wait(500);
    await client.screenshot('./screenshots/screenshot-390-light.png');

    // 390px Dark
    await client.evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`);
    await wait(500);
    await client.screenshot('./screenshots/screenshot-390-dark.png');

    // Viewport 2: 1440px (Desktop)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await wait(500);

    // 1440px Light
    await client.evaluate(`document.documentElement.setAttribute('data-theme', 'light')`);
    await wait(500);
    await client.screenshot('./screenshots/screenshot-1440-light.png');

    // 1440px Dark
    await client.evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`);
    await wait(500);
    await client.screenshot('./screenshots/screenshot-1440-dark.png');

    // Close-up of the dots in light mode
    await client.evaluate(`document.documentElement.setAttribute('data-theme', 'light')`);
    await wait(500);
    await client.screenshotClip('./screenshots/screenshot-dots-closeup.png', {
      x: 500,
      y: 200,
      width: 300,
      height: 300,
      scale: 1,
    });

    console.log('\nConsole Errors:', consoleErrors);
    console.log('Verification Complete.');

    return {
      lightStyles,
      darkStyles,
      bodyContrast,
      hintContrast,
      markerContrast,
      dotContrast,
      consoleErrors,
    };
  } finally {
    chromeProc.kill('SIGTERM');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
