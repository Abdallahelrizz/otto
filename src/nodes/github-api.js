import { credentialValue, parseJson, safeRequestJson } from './service-utils.js';

const BASE = 'https://api.github.com';

function githubHeaders(token) {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'otto-workflow',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function gh(path, { token, method = 'GET', body } = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${BASE}/${path.replace(/^\//, '')}`;
  const headers = githubHeaders(token);
  if (body && method !== 'GET') headers['Content-Type'] = 'application/json';
  return safeRequestJson(url, {
    method,
    headers,
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
}

export async function githubApi({ config, credential }) {
  const token = config.token || credentialValue(credential, ['token', 'value', 'apiKey']);
  const operation = config.operation ?? 'generic';
  const { owner, repo } = config;

  switch (operation) {
    case 'create_issue': {
      const { title, body, labels, assignees } = config;
      if (!owner || !repo || !title) throw new Error('GitHub create_issue requires owner, repo, title');
      return gh(`/repos/${owner}/${repo}/issues`, {
        token, method: 'POST',
        body: { title, body, labels: parseJson(labels, undefined), assignees: parseJson(assignees, undefined) },
      });
    }
    case 'get_issue': {
      const issueNumber = config.issueNumber ?? config.issue_number;
      if (!owner || !repo || !issueNumber) throw new Error('GitHub get_issue requires owner, repo, issueNumber');
      return gh(`/repos/${owner}/${repo}/issues/${issueNumber}`, { token });
    }
    case 'close_issue': {
      const issueNumber = config.issueNumber ?? config.issue_number;
      if (!owner || !repo || !issueNumber) throw new Error('GitHub close_issue requires owner, repo, issueNumber');
      return gh(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
        token, method: 'PATCH', body: { state: 'closed' },
      });
    }
    case 'list_issues': {
      if (!owner || !repo) throw new Error('GitHub list_issues requires owner, repo');
      const state = config.state ?? 'open';
      return gh(`/repos/${owner}/${repo}/issues?state=${state}&per_page=${config.perPage ?? 30}`, { token });
    }
    case 'create_pr': {
      const { title, head, base, body, draft } = config;
      if (!owner || !repo || !title || !head || !base) throw new Error('GitHub create_pr requires owner, repo, title, head, base');
      return gh(`/repos/${owner}/${repo}/pulls`, {
        token, method: 'POST', body: { title, head, base, body, draft: !!draft },
      });
    }
    case 'list_prs': {
      if (!owner || !repo) throw new Error('GitHub list_prs requires owner, repo');
      const state = config.state ?? 'open';
      return gh(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=${config.perPage ?? 30}`, { token });
    }
    case 'list_repos': {
      const org = config.org ?? owner;
      if (!org) throw new Error('GitHub list_repos requires org');
      return gh(`/orgs/${org}/repos?per_page=${config.perPage ?? 30}`, { token });
    }
    case 'get_pr': {
      const pullNumber = config.pullNumber ?? config.pull_number;
      if (!owner || !repo || !pullNumber) throw new Error('GitHub get_pr requires owner, repo, pullNumber');
      return gh(`/repos/${owner}/${repo}/pulls/${pullNumber}`, { token });
    }
    case 'add_comment': {
      const issueNumber = config.issueNumber ?? config.issue_number;
      const { body } = config;
      if (!owner || !repo || !issueNumber || !body) throw new Error('GitHub add_comment requires owner, repo, issueNumber, body');
      return gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        token, method: 'POST', body: { body },
      });
    }
    case 'update_issue': {
      const issueNumber = config.issueNumber ?? config.issue_number;
      if (!owner || !repo || !issueNumber) throw new Error('GitHub update_issue requires owner, repo, issueNumber');
      const patch = {};
      if (config.title !== undefined) patch.title = config.title;
      if (config.body !== undefined) patch.body = config.body;
      if (config.state !== undefined) patch.state = config.state;
      if (config.labels !== undefined) patch.labels = parseJson(config.labels, undefined);
      return gh(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
        token, method: 'PATCH', body: patch,
      });
    }
    case 'get_repo': {
      if (!owner || !repo) throw new Error('GitHub get_repo requires owner, repo');
      return gh(`/repos/${owner}/${repo}`, { token });
    }
    case 'create_release': {
      const { tagName, name, body, draft, prerelease } = config;
      if (!owner || !repo || !tagName) throw new Error('GitHub create_release requires owner, repo, tagName');
      const releaseBody = { tag_name: tagName };
      if (name !== undefined) releaseBody.name = name;
      if (body !== undefined) releaseBody.body = body;
      if (draft !== undefined) releaseBody.draft = !!draft;
      if (prerelease !== undefined) releaseBody.prerelease = !!prerelease;
      return gh(`/repos/${owner}/${repo}/releases`, {
        token, method: 'POST', body: releaseBody,
      });
    }
    case 'generic':
    default: {
      const method = String(config.method ?? 'GET').toUpperCase();
      const path = config.path || '/user';
      const body = parseJson(config.body, null);
      return gh(path, { token, method, body });
    }
  }
}
