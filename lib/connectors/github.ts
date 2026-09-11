import type { Connector } from './base';
import { repositoryName } from './base';

async function github(path: string) {
  // Fixed origin and validated path: user data cannot select a server or supply a token.
  const response = await fetch(`https://api.github.com/${path}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AI-Co-Founder' }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'Public repository not found. Private repositories need OAuth support.' : response.status === 403 || response.status === 429 ? 'GitHub rate limit reached. Try again later.' : 'GitHub could not be reached. Try syncing again.');
  return response.json();
}
export const githubConnector: Connector = {
  provider: 'github', capabilities: { read: true, write: false, execute: false, supportedActions: [] },
  async sync(resource) {
    const repo = repositoryName(resource);
    const [repository, issues, search] = await Promise.all([
      github(`repos/${repo}`), github(`repos/${repo}/issues?state=all&sort=updated&direction=desc&per_page=30`),
      github(`search/issues?q=${encodeURIComponent(`repo:${repo} is:issue is:open`)}&per_page=1`),
    ]);
    if (!Array.isArray(issues) || typeof search.total_count !== 'number' || repository.private) throw new Error('GitHub returned an unexpected response. No snapshot saved.');
    return {
      metadata: { repository: repo, open_issues: search.total_count, count_source: 'GitHub search index (may lag)', url: `https://github.com/${repo}`, sample_limit: 30 },
      events: issues.filter((i: { pull_request?: unknown }) => !i.pull_request).map((i: { number: number; state: string; title: string; updated_at: string; html_url: string }) => ({
        external_id: `${repo}:${i.number}:${i.updated_at}`, event_type: i.state === 'closed' ? 'issue_closed' : 'issue_opened',
        title: `#${i.number} ${String(i.title).slice(0, 200)}`, description: `Issue ${i.state}; latest observed update, not a complete event history.`, severity: 'info',
        payload: { number: i.number, state: i.state, url: i.html_url, repository: repo }, occurred_at: i.updated_at,
      })),
    };
  },
};
