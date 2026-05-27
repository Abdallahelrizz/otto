import { gzip, gunzip, deflate, inflate } from 'zlib';
import { promisify } from 'util';
import { getByPath } from '../utils/path.js';
import { makeItem } from '../utils/items.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeDelimiter(value) {
  if (value === '\\t') return '\t';
  const delimiter = String(value ?? ',');
  return delimiter.length ? delimiter : ',';
}

function getPathValue(input, path) {
  if (!path) return input;
  const value = getByPath(input, path);
  return value === undefined ? input?.[path] : value;
}

function getSourceValue(input, config, {
  valueKey = 'value',
  sourceKey = 'sourceField',
  defaultPath = 'data',
} = {}) {
  if (config?.[valueKey] !== undefined && config?.[valueKey] !== '') return config[valueKey];
  const path = config?.[sourceKey] ?? defaultPath;
  const value = getPathValue(input, path);
  return value === undefined ? input : value;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!['{', '[', '"'].includes(trimmed[0]) && !/^(true|false|null|-?\d)/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function cloneJson(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function setByPath(target, path, value) {
  const keys = String(path ?? '').split('.').map((key) => key.trim()).filter(Boolean);
  if (!keys.length) return value;
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return target;
}

function deleteByPath(target, path) {
  const keys = String(path ?? '').split('.').map((key) => key.trim()).filter(Boolean);
  if (!keys.length) return;
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    cursor = cursor?.[key];
    if (!cursor || typeof cursor !== 'object') return;
  }
  delete cursor[keys[keys.length - 1]];
}

function parseCsvRows(text, delimiter) {
  if (text == null || text === '') return [];
  const source = String(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (source.startsWith(delimiter, i)) {
      row.push(field);
      field = '';
      i += delimiter.length - 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field !== '' || row.length || !/(\r|\n)$/.test(source)) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function rowToObject(row, headers, trim) {
  const out = {};
  row.forEach((rawValue, index) => {
    const key = headers[index] || `col${index + 1}`;
    out[key] = trim ? String(rawValue).trim() : rawValue;
  });
  return out;
}

function csvEscape(value, delimiter) {
  const text = value == null ? '' : String(value);
  if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeRows(value) {
  const source = parseMaybeJson(value);
  const list = Array.isArray(source?.rows) ? source.rows
    : Array.isArray(source?.items) ? source.items
      : Array.isArray(source?.json) ? source.json
        : Array.isArray(source) ? source
          : [source];

  return list.map((row) => {
    if (row && typeof row === 'object' && 'json' in row) return row.json ?? {};
    if (row && typeof row === 'object' && 'data' in row && Object.keys(row).length === 1) return row.data ?? {};
    if (row && typeof row === 'object') return row;
    return { value: row };
  });
}

export async function csvParse({ input, config }) {
  const delimiter = normalizeDelimiter(config?.delimiter);
  const trim = parseBoolean(config?.trim, true);
  const hasHeader = parseBoolean(config?.hasHeader, true);
  const text = getSourceValue(input, config, { valueKey: 'text', defaultPath: 'data' });
  const csvRows = parseCsvRows(text, delimiter).map((row) => trim ? row.map((cell) => String(cell).trim()) : row);

  const explicitColumns = splitList(config?.columns);
  const headers = hasHeader
    ? (csvRows.shift() ?? [])
    : explicitColumns;
  const rows = csvRows.map((row) => rowToObject(row, headers, trim));

  return {
    rows,
    items: rows.map((row, index) => makeItem(row, { pairedItem: { item: index } })),
    columns: headers,
    count: rows.length,
  };
}

export async function csvStringify({ input, config }) {
  const delimiter = normalizeDelimiter(config?.delimiter);
  const includeHeader = parseBoolean(config?.includeHeader, true);
  const source = getSourceValue(input, config, { valueKey: 'value', defaultPath: 'rows' });
  const rows = normalizeRows(source);
  const configuredColumns = splitList(config?.columns);
  const columns = configuredColumns.length
    ? configuredColumns
    : [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))];

  const lines = [];
  if (includeHeader) lines.push(columns.map((column) => csvEscape(column, delimiter)).join(delimiter));
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row?.[column], delimiter)).join(delimiter));
  }

  return {
    csv: lines.join('\n'),
    columns,
    count: rows.length,
  };
}

function decodeXmlEntities(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function encodeXmlEntities(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseAttributes(value) {
  const attrs = {};
  const attrRe = /([A-Za-z_:\-][\w:.\-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const match of value.matchAll(attrRe)) {
    attrs[match[1]] = decodeXmlEntities(match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function appendText(stack, text) {
  const clean = decodeXmlEntities(text).trim();
  if (clean) stack[stack.length - 1].text.push(clean);
}

function parseXml(text) {
  const root = { name: null, attributes: {}, children: [], text: [] };
  const stack = [root];
  const tokenRe = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+>/g;
  let lastIndex = 0;

  for (const match of text.matchAll(tokenRe)) {
    appendText(stack, text.slice(lastIndex, match.index));
    const token = match[0];
    lastIndex = match.index + token.length;

    if (token.startsWith('<!--') || token.startsWith('<?') || /^<![^[]/.test(token)) continue;
    if (token.startsWith('<![CDATA[')) {
      appendText(stack, token.slice(9, -3));
      continue;
    }
    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim();
      while (stack.length > 1) {
        const node = stack.pop();
        if (node.name === name) break;
      }
      continue;
    }

    const selfClosing = token.endsWith('/>');
    const body = token.slice(1, selfClosing ? -2 : -1).trim();
    const tagMatch = /^([^\s/>]+)([\s\S]*)$/.exec(body);
    if (!tagMatch) continue;

    const node = {
      name: tagMatch[1],
      attributes: parseAttributes(tagMatch[2] ?? ''),
      children: [],
      text: [],
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }

  appendText(stack, text.slice(lastIndex));
  return root.children;
}

function xmlNodeToJson(node) {
  const attrs = node.attributes ?? {};
  const hasAttrs = Object.keys(attrs).length > 0;
  const text = (node.text ?? []).join(' ').trim();
  const childEntries = {};

  for (const child of node.children ?? []) {
    const childValue = xmlNodeToJson(child);
    if (Object.prototype.hasOwnProperty.call(childEntries, child.name)) {
      if (!Array.isArray(childEntries[child.name])) childEntries[child.name] = [childEntries[child.name]];
      childEntries[child.name].push(childValue);
    } else {
      childEntries[child.name] = childValue;
    }
  }

  const hasChildren = Object.keys(childEntries).length > 0;
  if (!hasAttrs && !hasChildren) return text;

  const out = {};
  if (hasAttrs) out.$ = attrs;
  if (text) out._text = text;
  return { ...out, ...childEntries };
}

export async function xmlParse({ input, config }) {
  const text = getSourceValue(input, config, { valueKey: 'text', defaultPath: 'data' });
  const nodes = parseXml(String(text ?? ''));
  const result = nodes.length === 1
    ? { [nodes[0].name]: xmlNodeToJson(nodes[0]) }
    : { root: nodes.map((node) => ({ [node.name]: xmlNodeToJson(node) })) };

  return {
    result,
    ...result,
  };
}

function xmlAttrs(attributes) {
  const attrs = attributes && typeof attributes === 'object' ? attributes : {};
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${encodeXmlEntities(value)}"`)
    .join('');
}

function xmlStringifyElement(name, value) {
  if (Array.isArray(value)) return value.map((item) => xmlStringifyElement(name, item)).join('');
  if (value == null) return `<${name}/>`;
  if (typeof value !== 'object') return `<${name}>${encodeXmlEntities(value)}</${name}>`;

  const attrs = xmlAttrs(value.$);
  const text = value._text == null ? '' : encodeXmlEntities(value._text);
  const childEntries = Object.entries(value).filter(([key]) => key !== '$' && key !== '_text');
  const children = childEntries.map(([key, child]) => xmlStringifyElement(key, child)).join('');

  if (!text && !children) return `<${name}${attrs}/>`;
  return `<${name}${attrs}>${text}${children}</${name}>`;
}

export async function xmlStringify({ input, config }) {
  const rawValue = getSourceValue(input, config, { valueKey: 'value', defaultPath: 'data' });
  const value = parseMaybeJson(rawValue);
  const rootName = String(config?.rootName ?? 'root').trim();

  let xml;
  if (!rootName && value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1) {
    const [name, child] = Object.entries(value)[0];
    xml = xmlStringifyElement(name, child);
  } else {
    xml = xmlStringifyElement(rootName || 'root', value);
  }

  return { xml };
}

function parseHtmlSelector(selector) {
  const value = String(selector ?? '').trim();
  const id = value.match(/#([\w-]+)/)?.[1] ?? null;
  const className = value.match(/\.([\w-]+)/)?.[1] ?? null;
  const tag = value.match(/^([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase() ?? null;
  return { tag, id, className };
}

function htmlAttributes(value) {
  const attrs = {};
  const attrRe = /([A-Za-z_:\-][\w:.\-]*)\s*(=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of value.matchAll(attrRe)) {
    attrs[match[1].toLowerCase()] = decodeXmlEntities(match[4] ?? match[5] ?? match[6] ?? '');
  }
  return attrs;
}

function stripHtml(value) {
  return decodeXmlEntities(String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}

function matchesSelector(attrs, selector) {
  if (selector.id && attrs.id !== selector.id) return false;
  if (selector.className) {
    const classes = String(attrs.class ?? '').split(/\s+/);
    if (!classes.includes(selector.className)) return false;
  }
  return true;
}

function extractHtml(html, selectorText, attribute, multiple) {
  const selector = parseHtmlSelector(selectorText);
  const tagPattern = selector.tag ?? '[A-Za-z][\\w:-]*';
  const elementRe = new RegExp(`<(${tagPattern})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, 'gi');
  const matches = [];

  for (const match of html.matchAll(elementRe)) {
    const tag = match[1].toLowerCase();
    if (selector.tag && tag !== selector.tag) continue;
    const attrs = htmlAttributes(match[2] ?? '');
    if (!matchesSelector(attrs, selector)) continue;
    const innerHtml = match[3] ?? '';
    if (attribute === 'html') matches.push(innerHtml);
    else if (attribute === 'text') matches.push(stripHtml(innerHtml));
    else matches.push(attrs[String(attribute).toLowerCase()] ?? '');
  }

  if (matches.length === 0 && selector.tag && attribute !== 'text' && attribute !== 'html') {
    const openTagRe = new RegExp(`<${selector.tag}\\b([^>]*)\\/?>`, 'gi');
    for (const match of html.matchAll(openTagRe)) {
      const attrs = htmlAttributes(match[1] ?? '');
      if (matchesSelector(attrs, selector)) matches.push(attrs[String(attribute).toLowerCase()] ?? '');
    }
  }

  return {
    result: multiple ? matches : (matches[0] ?? ''),
    matches,
    count: matches.length,
  };
}

export async function htmlExtract({ input, config }) {
  const html = String(getSourceValue(input, config, { valueKey: 'html', defaultPath: 'html' }) ?? '');
  const selector = config?.selector ?? 'title';
  const attribute = config?.attribute ?? 'text';
  const multiple = parseBoolean(config?.multiple, false);
  return extractHtml(html, selector, attribute, multiple);
}

function pickPaths(source, paths) {
  const out = {};
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (value !== undefined) setByPath(out, path, value);
  }
  return out;
}

export async function jsonTransform({ input, config }) {
  const operation = config?.operation ?? 'get';
  const source = parseMaybeJson(getSourceValue(input, config, { valueKey: 'value', defaultPath: '' }));
  const path = config?.path ?? '';

  switch (operation) {
    case 'get': {
      const result = path ? getPathValue(source, path) : source;
      return { result, value: result };
    }
    case 'set': {
      const result = cloneJson(source ?? {});
      setByPath(result, path, parseMaybeJson(config?.setValue));
      return { result };
    }
    case 'pick': {
      const result = pickPaths(source ?? {}, splitList(config?.paths || path));
      return { result };
    }
    case 'omit': {
      const result = cloneJson(source ?? {});
      for (const item of splitList(config?.paths || path)) deleteByPath(result, item);
      return { result };
    }
    case 'parse': {
      const result = parseMaybeJson(source);
      return { result };
    }
    case 'stringify': {
      const space = Number(config?.space ?? 2);
      return { result: JSON.stringify(source, null, Number.isFinite(space) ? space : 2) };
    }
    case 'merge': {
      const other = parseMaybeJson(config?.setValue);
      return { result: { ...(source ?? {}), ...(other ?? {}) } };
    }
    default:
      throw new Error(`JSON Transform: unknown operation "${operation}"`);
  }
}

export async function compressionNode({ input, config }) {
  const operation = config?.operation ?? 'gzip';
  const source = getSourceValue(input, config, { valueKey: 'value', defaultPath: 'data' });
  const inputEncoding = config?.inputEncoding || (['gunzip', 'inflate'].includes(operation) ? 'base64' : 'utf8');
  const outputEncoding = config?.outputEncoding || (['gzip', 'deflate'].includes(operation) ? 'base64' : 'utf8');
  const buffer = Buffer.isBuffer(source)
    ? source
    : Buffer.from(String(source ?? ''), inputEncoding);

  let resultBuffer;
  switch (operation) {
    case 'gzip':
      resultBuffer = await gzipAsync(buffer);
      break;
    case 'gunzip':
      resultBuffer = await gunzipAsync(buffer);
      break;
    case 'deflate':
      resultBuffer = await deflateAsync(buffer);
      break;
    case 'inflate':
      resultBuffer = await inflateAsync(buffer);
      break;
    default:
      throw new Error(`Compression: unknown operation "${operation}"`);
  }

  return {
    result: resultBuffer.toString(outputEncoding),
    operation,
    inputEncoding,
    outputEncoding,
  };
}
