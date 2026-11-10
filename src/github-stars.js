const repository = 'operatic-ai/corl-explorer';
const cacheKey = 'corl-github-stars';
const refreshInterval = 5 * 60 * 1000;
const validCount = value => Number.isSafeInteger(value) && value >= 0;

// The published snapshot also works while the repository is private. No GitHub
// credentials are shipped to visitors; Actions refreshes it when stars change.
export function mountGithubStars(link) {
  const count = link.querySelector('span');
  let lastAttempt = 0;
  const display = stars => {
    if (!validCount(stars)) return;
    count.textContent = new Intl.NumberFormat('en', {
      notation: 'compact', maximumFractionDigits: 1,
    }).format(stars);
    count.hidden = false;
    const label = `${stars.toLocaleString('en')} ${stars === 1 ? 'star' : 'stars'} on GitHub`;
    link.setAttribute('aria-label', label);
    link.title = label;
  };
  async function refresh() {
    if (Date.now() - lastAttempt < refreshInterval) return;
    lastAttempt = Date.now();
    try {
      const response = await fetch('/data/github-stars.json', {
        cache: 'no-cache', signal: AbortSignal.timeout(5000),
      });
      if (response.ok) display((await response.json()).stars);
    } catch { /* Keep the GitHub link usable when the snapshot is unavailable. */ }
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey));
      if (cached && validCount(cached.stars) && Date.now() - cached.fetchedAt < refreshInterval) {
        display(cached.stars);
        return;
      }
    } catch { /* Storage may be blocked. */ }
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}`, {
        headers: {Accept: 'application/vnd.github+json'}, signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return; // Private repositories and rate limits use the snapshot.
      const {stargazers_count: stars} = await response.json();
      if (!validCount(stars)) return;
      display(stars);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({stars, fetchedAt: Date.now()})); } catch {}
    } catch { /* Network failures retain the last known count. */ }
  }
  refresh();
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
}
