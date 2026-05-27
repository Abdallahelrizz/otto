import { credentialValue, parseJson, requestJson } from './service-utils.js';

const BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function notionHeaders(token, notionVersion) {
  if (!token) throw new Error('Notion: API token is required');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': notionVersion ?? NOTION_VERSION,
  };
}

function notion(path, { token, method = 'GET', body, notionVersion } = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${BASE}/${path.replace(/^\//, '')}`;
  return requestJson(url, {
    method,
    headers: notionHeaders(token, notionVersion),
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export async function notionApi({ config, credential }) {
  const token = config.token || credentialValue(credential, ['token', 'value', 'apiKey']);
  const notionVersion = config.notionVersion ?? NOTION_VERSION;
  const operation = config.operation ?? 'generic';

  switch (operation) {
    case 'create_page': {
      const { parentId, parentType = 'page', title, content } = config;
      if (!parentId) throw new Error('Notion create_page requires parentId');
      const parent = parentType === 'database'
        ? { database_id: parentId }
        : { page_id: parentId };
      const body = {
        parent,
        properties: {
          title: { title: [{ text: { content: title ?? '' } }] },
        },
      };
      if (content) body.children = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content } }] } }];
      return notion('/pages', { token, method: 'POST', body, notionVersion });
    }
    case 'get_page': {
      const { pageId } = config;
      if (!pageId) throw new Error('Notion get_page requires pageId');
      return notion(`/pages/${pageId}`, { token, notionVersion });
    }
    case 'update_page': {
      const { pageId, properties } = config;
      if (!pageId) throw new Error('Notion update_page requires pageId');
      return notion(`/pages/${pageId}`, {
        token, method: 'PATCH',
        body: { properties: parseJson(properties, {}) },
        notionVersion,
      });
    }
    case 'list_pages': {
      const { databaseId, filter, sorts } = config;
      if (!databaseId) throw new Error('Notion list_pages requires databaseId');
      const body = {};
      if (filter) body.filter = parseJson(filter, undefined);
      if (sorts) body.sorts = parseJson(sorts, undefined);
      if (config.pageSize) body.page_size = Math.min(100, Number(config.pageSize));
      return notion(`/databases/${databaseId}/query`, { token, method: 'POST', body, notionVersion });
    }
    case 'search': {
      const body = {};
      if (config.query) body.query = config.query;
      if (config.filter) body.filter = parseJson(config.filter, undefined);
      if (config.sort) body.sort = parseJson(config.sort, undefined);
      return notion('/search', { token, method: 'POST', body, notionVersion });
    }
    case 'delete_page': {
      const { pageId } = config;
      if (!pageId) throw new Error('Notion delete_page requires pageId');
      return notion(`/pages/${pageId}`, {
        token, method: 'PATCH',
        body: { archived: true },
        notionVersion,
      });
    }
    case 'append_block': {
      const { blockId } = config;
      if (!blockId) throw new Error('Notion append_block requires blockId');
      const children = parseJson(config.children ?? config.childrenJson, []);
      return notion(`/blocks/${blockId}/children`, {
        token, method: 'POST',
        body: { children },
        notionVersion,
      });
    }
    case 'list_databases': {
      const body = { filter: { value: 'database', property: 'object' } };
      if (config.query) body.query = config.query;
      if (config.pageSize) body.page_size = Math.min(100, Number(config.pageSize));
      return notion('/search', { token, method: 'POST', body, notionVersion });
    }
    case 'get_database': {
      const { databaseId } = config;
      if (!databaseId) throw new Error('Notion get_database requires databaseId');
      return notion(`/databases/${databaseId}`, { token, notionVersion });
    }
    case 'generic':
    default: {
      const method = String(config.method ?? 'GET').toUpperCase();
      const path = config.path || '/users/me';
      const body = parseJson(config.body, null);
      return notion(path, { token, method, body: body ?? undefined, notionVersion });
    }
  }
}
