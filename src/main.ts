/**
 * main.ts — Entry point.
 *
 * Phase 1: Static layout + project grid population.
 * Physics modules (physics.ts, letters.ts, ink.ts, creatures.ts)
 * are imported from Phase 2 onward.
 */

import './style.css';
import projects from './data/projects.json';

// ── Reduced-motion guard ───────────────────────────────────────────
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (RM) document.body.classList.add('rm');

// ── Project grid ──────────────────────────────────────────────────
const grid = document.getElementById('project-grid');
if (grid && grid.children.length === 0) {
  for (const proj of projects) {
    const card = document.createElement('article');
    card.className = 'project-card';

    const name = document.createElement('h3');
    name.className = 'project-name';
    name.textContent = proj.name;

    const desc = document.createElement('p');
    desc.className = 'project-desc';
    desc.textContent = proj.description;

    const footer = document.createElement('div');
    footer.className = 'project-footer';

    const lang = document.createElement('span');
    lang.className = 'project-lang';
    lang.textContent = proj.language;

    const link = document.createElement('a');
    link.className = 'project-link';
    link.href = proj.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'view';
    link.setAttribute('aria-label', `View ${proj.name} on GitHub (opens in new tab)`);

    footer.append(lang, link);
    card.append(name, desc, footer);
    grid.append(card);
  }
}

// ── Marker highlight ──────────────────────────────────────────────
// Walk text nodes in .mk elements and wrap each word in a <span class="m">
function walk(root: Element, fn: (node: Text) => void): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach(fn);
}

function wrapWords(node: Text): void {
  const frag = document.createDocumentFragment();
  const parts = node.data.split(/(\s+)/);
  for (const part of parts) {
    if (part.trim()) {
      const span = document.createElement('span');
      span.className = 'm';
      span.textContent = part;
      frag.append(span);
    } else {
      frag.append(part);
    }
  }
  node.replaceWith(frag);
}

document.querySelectorAll<Element>('.mk').forEach((root) => {
  walk(root, wrapWords);
});

// Touch/mouse: highlight word on pointerover (passive)
document.addEventListener(
  'pointerover',
  (e) => {
    const target = e.target as Element;
    const m = target.closest?.('.m') as HTMLElement | null;
    if (m) m.classList.add('on');
  },
  { passive: true }
);

// ── Gravity button ────────────────────────────────────────────────
const btn = document.getElementById('g') as HTMLButtonElement;
let gravityOn = false;
if (btn) {
  btn.addEventListener('click', () => {
    gravityOn = !gravityOn;
    btn.textContent = gravityOn ? 'pull back' : 'let go';
    btn.setAttribute('aria-pressed', String(gravityOn));
    dispatchEvent(new CustomEvent('gravity', { detail: gravityOn }));
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      btn.click();
    }
  });
}

// ── Tilt button (Optional) ────────────────────────────────────────
const tiltBtn = document.getElementById('btn-tilt') as HTMLButtonElement | null;
let tiltActive = false;

if (tiltBtn && typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
  tiltBtn.style.display = 'inline-flex';

  const handleOrientation = (e: DeviceOrientationEvent) => {
    if (!tiltActive) return;
    const gamma = e.gamma ?? 0;
    const beta = e.beta ?? 45;
    const gx = Math.sin((gamma * Math.PI) / 180) * 0.7;
    const gy = Math.sin((beta * Math.PI) / 180) * 0.7;
    dispatchEvent(
      new CustomEvent('tiltchange', {
        detail: {
          active: true,
          gx: Math.abs(gx) < 0.05 ? 0 : gx,
          gy: Math.abs(gy) < 0.05 ? 0.7 : gy,
        },
      })
    );
  };

  tiltBtn.addEventListener('click', async () => {
    if (tiltActive) {
      tiltActive = false;
      tiltBtn.setAttribute('aria-pressed', 'false');
      tiltBtn.classList.remove('active');
      window.removeEventListener('deviceorientation', handleOrientation);
      dispatchEvent(
        new CustomEvent('tiltchange', { detail: { active: false, gx: 0, gy: 0.7 } })
      );
      return;
    }

    // iOS 13+ permission gating inside click handler
    if (
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    ) {
      try {
        const permission = await (
          DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();
        if (permission !== 'granted') {
          tiltBtn.style.display = 'none';
          return;
        }
      } catch {
        tiltBtn.style.display = 'none';
        return;
      }
    }

    tiltActive = true;
    tiltBtn.setAttribute('aria-pressed', 'true');
    tiltBtn.classList.add('active');
    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    dispatchEvent(
      new CustomEvent('tiltchange', { detail: { active: true, gx: 0, gy: 0.7 } })
    );
  });
}

// ── Boot physics ───────────────────────────────────────────────────
if (!RM) {
  import('./physics/bootstrap').catch(() => {
    // Static layout still works gracefully if physics fails
  });
}
