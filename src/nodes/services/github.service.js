// src/nodes/services/github.service.js
export default {
  type: 'github_api',
  label: 'GitHub',
  category: 'integrations',
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
  },
};
