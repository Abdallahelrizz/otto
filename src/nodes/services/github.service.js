// src/nodes/services/github.service.js
export default {
  type: 'github_api',
  label: 'GitHub',
  category: 'integrations',
  serviceColor: '#1F2328',
  base: 'https://api.github.com',
  credential: { catalog: 'githubApi', keys: ['token', 'value', 'apiKey'] },
  auth: {
    kind: 'bearer',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'otto-workflow',
    },
  },
  defaultOperation: 'get_repo',
  operations: {
    create_issue: {
      method: 'POST', path: '/repos/{owner}/{repo}/issues',
      fields: [
        { key: 'owner', required: true }, { key: 'repo', required: true },
        { key: 'title', required: true }, { key: 'body' },
      ],
      body: { title: '{title}', body: '{body}' },
    },
    get_issue: {
      method: 'GET', path: '/repos/{owner}/{repo}/issues/{issueNumber}',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'issueNumber', required: true }],
    },
    list_issues: {
      method: 'GET', path: '/repos/{owner}/{repo}/issues',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }],
      query: { state: '{state}', per_page: '{perPage}' },
    },
    add_comment: {
      method: 'POST', path: '/repos/{owner}/{repo}/issues/{issueNumber}/comments',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'issueNumber', required: true }, { key: 'body', required: true }],
      body: { body: '{body}' },
    },
    get_repo: {
      method: 'GET', path: '/repos/{owner}/{repo}',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }],
    },
    list_repos: {
      method: 'GET', path: '/orgs/{org}/repos',
      fields: [{ key: 'org', required: true }],
      query: { per_page: '{perPage}' },
    },
    close_issue: {
      method: 'PATCH', path: '/repos/{owner}/{repo}/issues/{issueNumber}',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'issueNumber', required: true }],
      body: { state: 'closed' },
    },
    update_issue: {
      method: 'PATCH', path: '/repos/{owner}/{repo}/issues/{issueNumber}',
      fields: [
        { key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'issueNumber', required: true },
        { key: 'title' }, { key: 'body' }, { key: 'state' },
      ],
      body: { title: '{title}', body: '{body}', state: '{state}' },
    },
    create_pr: {
      method: 'POST', path: '/repos/{owner}/{repo}/pulls',
      fields: [
        { key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'title', required: true },
        { key: 'head', required: true }, { key: 'base', required: true }, { key: 'body' }, { key: 'draft' },
      ],
      body: { title: '{title}', head: '{head}', base: '{base}', body: '{body}', draft: '{draft}' },
    },
    get_pr: {
      method: 'GET', path: '/repos/{owner}/{repo}/pulls/{pullNumber}',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'pullNumber', required: true }],
    },
    list_prs: {
      method: 'GET', path: '/repos/{owner}/{repo}/pulls',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }],
      query: { state: '{state}', per_page: '{perPage}' },
    },
    create_release: {
      method: 'POST', path: '/repos/{owner}/{repo}/releases',
      fields: [
        { key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'tagName', required: true },
        { key: 'name' }, { key: 'body' }, { key: 'draft' }, { key: 'prerelease' },
      ],
      body: { tag_name: '{tagName}', name: '{name}', body: '{body}', draft: '{draft}', prerelease: '{prerelease}' },
    },
  },
};
