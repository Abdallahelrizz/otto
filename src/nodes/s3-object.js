import { createHash, createHmac } from 'crypto';
import path from 'path';
import {
  bufferFromValue,
  detectMimeType,
  getBinaryData,
  getBinaryRef,
  saveBinaryData,
} from '../utils/binary-data.js';
import { getByPath } from '../utils/path.js';

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

function parseBoolean(value, fallback = true) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(next, min), max);
}

function normalizeEndpoint(endpoint, region) {
  const value = String(endpoint || '').trim();
  if (value) return value.replace(/\/+$/, '');
  return `https://s3.${region}.amazonaws.com`;
}

function s3Credentials(config, credential) {
  const data = credential?.data ?? {};
  const region = config.region || data.region || process.env.S3_REGION || 'us-east-1';
  return {
    accessKeyId: data.accessKeyId || process.env.S3_ACCESS_KEY_ID || config.accessKeyId,
    secretAccessKey: data.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || config.secretAccessKey,
    sessionToken: data.sessionToken || process.env.S3_SESSION_TOKEN || config.sessionToken,
    region,
    endpoint: normalizeEndpoint(config.endpoint || data.endpoint || process.env.S3_ENDPOINT, region),
    bucket: config.bucket || data.bucket || process.env.S3_BUCKET,
    forcePathStyle: parseBoolean(config.forcePathStyle ?? data.forcePathStyle, true),
  };
}

function encodeKey(key) {
  return String(key ?? '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function buildObjectUrl({ endpoint, bucket, key = '', query = {}, forcePathStyle = true }) {
  const base = new URL(endpoint);
  if (forcePathStyle) {
    const parts = [bucket, key].filter(Boolean).map(encodeKey);
    base.pathname = `${base.pathname.replace(/\/$/, '')}/${parts.join('/')}`;
  } else {
    base.hostname = `${bucket}.${base.hostname}`;
    base.pathname = key ? `/${encodeKey(key)}` : '/';
  }

  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    base.searchParams.set(name, String(value));
  }

  return base;
}

function hashBody(body) {
  if (body == null) return EMPTY_SHA256;
  return createHash('sha256').update(body).digest('hex');
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function isoAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(url) {
  return [...url.searchParams.entries()]
    .sort(([aName, aValue], [bName, bValue]) => aName.localeCompare(bName) || aValue.localeCompare(bValue))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function canonicalHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, ' ')])
    .sort(([a], [b]) => a.localeCompare(b));
}

export function signS3Request({ method, url, headers = {}, body = null, credentials, now = new Date() }) {
  const requestUrl = url instanceof URL ? url : new URL(url);
  const amzDate = isoAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = headers['x-amz-content-sha256'] || hashBody(body);
  const signedHeadersInput = {
    ...headers,
    host: requestUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (credentials.sessionToken) signedHeadersInput['x-amz-security-token'] = credentials.sessionToken;

  const headerPairs = canonicalHeaders(signedHeadersInput);
  const signedHeaders = headerPairs.map(([key]) => key).join(';');
  const canonicalHeaderText = headerPairs.map(([key, value]) => `${key}:${value}\n`).join('');
  const canonicalRequest = [
    method.toUpperCase(),
    requestUrl.pathname || '/',
    canonicalQuery(requestUrl),
    canonicalHeaderText,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${credentials.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const dateKey = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, credentials.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');

  return {
    ...signedHeadersInput,
    Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function assertS3Shape(config, credentials) {
  if (!credentials.bucket) throw new Error('S3 Object: bucket is required');
  if (!credentials.accessKeyId) throw new Error('S3 Object: accessKeyId is required in an S3 credential or S3_ACCESS_KEY_ID');
  if (!credentials.secretAccessKey) throw new Error('S3 Object: secretAccessKey is required in an S3 credential or S3_SECRET_ACCESS_KEY');
  const operation = config.operation ?? 'list';
  if (['get', 'put', 'delete', 'head'].includes(operation) && !config.key) {
    throw new Error(`S3 Object: key is required for ${operation}`);
  }
}

function xmlDecode(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function firstTag(xml, tag) {
  const match = String(xml ?? '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? xmlDecode(match[1]) : null;
}

function parseListObjectsXml(xml) {
  return [...String(xml ?? '').matchAll(/<Contents>([\s\S]*?)<\/Contents>/gi)]
    .map((match) => {
      const item = match[1];
      return {
        key: firstTag(item, 'Key'),
        lastModified: firstTag(item, 'LastModified'),
        eTag: firstTag(item, 'ETag')?.replace(/^"|"$/g, ''),
        size: Number(firstTag(item, 'Size') ?? 0),
        storageClass: firstTag(item, 'StorageClass'),
      };
    })
    .filter((item) => item.key);
}

function responseHeaders(response) {
  return {
    eTag: response.headers.get('etag')?.replace(/^"|"$/g, '') ?? null,
    contentType: response.headers.get('content-type') ?? null,
    contentLength: Number(response.headers.get('content-length') ?? 0) || null,
    lastModified: response.headers.get('last-modified') ?? null,
  };
}

async function assertOk(response, operation) {
  if (response.ok) return;
  const text = await response.text().catch(() => '');
  throw new Error(`S3 Object: ${operation} failed with ${response.status}${text ? ` - ${text.slice(0, 300)}` : ''}`);
}

async function bodyForPut({ input, config, workspaceId }) {
  const sourceMode = config.sourceMode ?? 'text';
  if (sourceMode === 'binary') {
    const binaryProperty = config.binaryProperty ?? 'data';
    const ref = getBinaryRef(input, binaryProperty);
    if (!ref) throw new Error(`S3 Object: binary property "${binaryProperty}" was not found`);
    const row = await getBinaryData(workspaceId, ref.id);
    if (!row) throw new Error(`S3 Object: binary data "${ref.id}" was not found`);
    return {
      body: row.data,
      contentType: config.contentType || row.mime_type || detectMimeType(row.file_name),
    };
  }

  const source = config.value !== undefined && config.value !== ''
    ? config.value
    : getByPath(input, config.sourceField || 'data');
  return {
    body: bufferFromValue(source, config.encoding === 'base64' ? 'base64' : 'utf8'),
    contentType: config.contentType || 'application/octet-stream',
  };
}

export async function s3Object({ input, config, credential, workspaceId }) {
  const operation = config.operation ?? 'list';
  const credentials = s3Credentials(config, credential);
  assertS3Shape(config, credentials);

  if (operation === 'list') {
    const url = buildObjectUrl({
      endpoint: credentials.endpoint,
      bucket: credentials.bucket,
      query: {
        'list-type': '2',
        prefix: config.prefix,
        'max-keys': parseNumber(config.maxKeys, 100, 1, 1000),
        'continuation-token': config.continuationToken,
      },
      forcePathStyle: credentials.forcePathStyle,
    });
    const headers = signS3Request({ method: 'GET', url, credentials });
    const response = await fetch(url, { method: 'GET', headers });
    await assertOk(response, 'list');
    const xml = await response.text();
    const objects = parseListObjectsXml(xml);
    return {
      bucket: credentials.bucket,
      prefix: config.prefix ?? '',
      objects,
      count: objects.length,
      nextContinuationToken: firstTag(xml, 'NextContinuationToken'),
      isTruncated: firstTag(xml, 'IsTruncated') === 'true',
    };
  }

  if (operation === 'put') {
    const { body, contentType } = await bodyForPut({ input, config, workspaceId });
    const url = buildObjectUrl({
      endpoint: credentials.endpoint,
      bucket: credentials.bucket,
      key: config.key,
      forcePathStyle: credentials.forcePathStyle,
    });
    const baseHeaders = {
      'content-type': contentType,
    };
    const headers = signS3Request({ method: 'PUT', url, headers: baseHeaders, body, credentials });
    const response = await fetch(url, { method: 'PUT', headers, body });
    await assertOk(response, 'put');
    return {
      bucket: credentials.bucket,
      key: config.key,
      ok: true,
      status: response.status,
      ...responseHeaders(response),
    };
  }

  if (operation === 'get') {
    const url = buildObjectUrl({
      endpoint: credentials.endpoint,
      bucket: credentials.bucket,
      key: config.key,
      forcePathStyle: credentials.forcePathStyle,
    });
    const headers = signS3Request({ method: 'GET', url, credentials });
    const response = await fetch(url, { method: 'GET', headers });
    await assertOk(response, 'get');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const binaryProperty = config.binaryProperty ?? 'data';
    const fileName = config.fileName || path.basename(String(config.key));
    const ref = await saveBinaryData({
      workspaceId,
      fileName,
      mimeType: response.headers.get('content-type') || detectMimeType(fileName),
      buffer,
      metadata: {
        source: 's3_object',
        bucket: credentials.bucket,
        key: config.key,
        eTag: response.headers.get('etag')?.replace(/^"|"$/g, '') ?? null,
      },
    });
    return {
      bucket: credentials.bucket,
      key: config.key,
      fileName,
      binary: { [binaryProperty]: ref },
      ...responseHeaders(response),
    };
  }

  if (operation === 'head') {
    const url = buildObjectUrl({
      endpoint: credentials.endpoint,
      bucket: credentials.bucket,
      key: config.key,
      forcePathStyle: credentials.forcePathStyle,
    });
    const headers = signS3Request({ method: 'HEAD', url, credentials });
    const response = await fetch(url, { method: 'HEAD', headers });
    await assertOk(response, 'head');
    return {
      bucket: credentials.bucket,
      key: config.key,
      found: true,
      ...responseHeaders(response),
    };
  }

  if (operation === 'delete') {
    const url = buildObjectUrl({
      endpoint: credentials.endpoint,
      bucket: credentials.bucket,
      key: config.key,
      forcePathStyle: credentials.forcePathStyle,
    });
    const headers = signS3Request({ method: 'DELETE', url, credentials });
    const response = await fetch(url, { method: 'DELETE', headers });
    await assertOk(response, 'delete');
    return {
      bucket: credentials.bucket,
      key: config.key,
      deleted: true,
      status: response.status,
    };
  }

  throw new Error(`S3 Object: unsupported operation "${operation}"`);
}
