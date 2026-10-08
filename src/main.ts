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
if (grid) {
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

// Touch/mouse: highlight word on pointerover
document.addEventListener('pointerover', (e) => {
  const target = e.target as Element;
  const m = target.closest?.('.m') as HTMLElement | null;
  if (m) m.classList.add('on');
});

// ── Gravity button (Phase 2 will wire physics — stub here) ────────
const btn = document.getElementById('g') as HTMLButtonElement;
let gravityOn = false;
btn.addEventListener('click', () => {
  gravityOn = !gravityOn;
  btn.textContent = gravityOn ? 'pull back' : 'let go';
  btn.setAttribute('aria-pressed', String(gravityOn));
  // Physics module will read gravityOn via exported ref in Phase 2
  dispatchEvent(new CustomEvent('gravity', { detail: gravityOn }));
});
btn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    btn.click();
  }
});

// ── Boot physics (Phase 2+) ───────────────────────────────────────
if (!RM) {
  // Dynamically import physics modules (added in Phase 2)
  // This import is a no-op until Phase 2 files exist.
  import('./physics/bootstrap').catch(() => {
    // Physics not yet wired; static layout still works.
  });
}
