/**
 * scripts/fetch-projects.mjs
 * Pulls best non-fork repos with descriptions from GitHub at build time,
 * sorted by stars (descending) then pushed date (descending), max 6.
 * Fallback to existing src/data/projects.json on rate limits or network errors.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(__dirname, '../src/data/projects.json');

async function fetchRepos() {
  console.log('[fetch-projects] Fetching repos from GitHub for mahendrapratap23...');
  try {
    const res = await fetch('https://api.github.com/users/mahendrapratap23/repos?per_page=100&sort=pushed', {
      headers: {
        'User-Agent': 'Portfolio-Build-Script',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      console.warn(`[fetch-projects] GitHub API returned status ${res.status}. Using existing local data.`);
      return;
    }

    const repos = await res.json();
    if (!Array.isArray(repos)) {
      console.warn('[fetch-projects] GitHub response is not an array. Keeping existing data.');
      return;
    }

    // Filter: non-forks, with a non-empty description
    const nonForks = repos.filter((r) => !r.fork && r.description && r.description.trim().length > 0);

    // Sort by stars descending, then pushed_at descending
    nonForks.sort((a, b) => {
      const starDiff = (b.stargazers_count || 0) - (a.stargazers_count || 0);
      if (starDiff !== 0) return starDiff;
      return new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime();
    });

    const top6 = nonForks.slice(0, 6).map((r) => ({
      name: r.name,
      description: r.description.trim(),
      language: r.language || 'Code',
      stars: r.stargazers_count || 0,
      url: r.html_url,
      pushed: r.pushed_at ? r.pushed_at.slice(0, 10) : '',
    }));

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(top6, null, 2) + '\n', 'utf-8');
    console.log(`[fetch-projects] Successfully saved ${top6.length} projects to src/data/projects.json`);
  } catch (err) {
    console.warn('[fetch-projects] Error fetching repos:', err.message, '- keeping existing data.');
  }
}

fetchRepos();
