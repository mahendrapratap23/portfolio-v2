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

import { projectsPendulumManager } from './physics/projects-pendulum';
import { contactPlaneManager } from './physics/contact-plane';

// ── Project grid ──────────────────────────────────────────────────
const grid = document.getElementById('project-grid');
if (grid && grid.children.length === 0) {
  projects.forEach((proj, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'project-hanging-wrapper';
    wrapper.dataset.repo = proj.name;

    wrapper.innerHTML = `
      <div class="project-pin-container" aria-hidden="true">
        <svg class="project-pin-svg" viewBox="0 0 32 40" width="32" height="40">
          <ellipse cx="18" cy="12" rx="6" ry="4" fill="color-mix(in srgb, var(--ink) 12%, transparent)" />
          <ellipse cx="16" cy="10" rx="6.5" ry="5" fill="var(--blue)" stroke="var(--ink)" stroke-width="1.4" />
          <circle cx="15" cy="9" r="2" fill="var(--paper)" opacity="0.6" />
          <line x1="16" y1="15" x2="16" y2="22" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round" />
          <path d="M16 20 Q15 29 16 38" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="2.5 1.5" fill="none" opacity="0.85" />
        </svg>
      </div>
      <article class="project-card" role="button" tabindex="0" aria-expanded="false" aria-label="${proj.name} project card. Tap or press Enter to flip for details." data-repo="${proj.name}">
        <div class="project-card-inner">
          <div class="project-face project-face-front">
            <div class="card-top-row">
              <span class="card-sketch-num">№ 0${index + 1}</span>
              <span class="project-lang">${proj.language}</span>
            </div>
            <h3 class="project-name">${proj.name}</h3>
            <div class="card-flip-prompt" aria-hidden="true">
              <span class="flip-icon">↻</span>
              <span>tap or Enter to inspect</span>
            </div>
          </div>
          <div class="project-face project-face-back" aria-hidden="true">
            <div class="card-top-row">
              <h3 class="project-name">${proj.name}</h3>
            </div>
            <p class="project-desc">${proj.description}</p>
            <div class="project-footer">
              <span class="project-lang">${proj.language}</span>
              <a class="project-link" href="${proj.url}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-label="View ${proj.name} on GitHub (opens in new tab)">
                <span>view repo</span>
                <span class="link-arrow" aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>
      </article>
    `;
    grid.append(wrapper);
  });
}

// Initialize pendulum card interactions (flip, keyboard, pendulum)
projectsPendulumManager.init('project-grid');

// Initialize paper plane fold and flight interaction
contactPlaneManager.init('contact-note');

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
} else {
  import('./physics/timeline-writer').then(({ timelineWriter }) => {
    timelineWriter.init('sec-work');
  }).catch(() => {});
}
