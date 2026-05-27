import assert from 'assert/strict';
import { mkdir, rm } from 'fs/promises';
import path from 'path';

import { db } from '../src/db/client.js';
import { getNodeHandler } from '../src/nodes/index.js';
import { binaryMetadata } from '../src/nodes/binary-metadata.js';
import { listFiles } from '../src/nodes/list-files.js';
import { s3Object, signS3Request } from '../src/nodes/s3-object.js';
import { writeWorkspaceFile } from '../src/utils/binary-data.js';
import { importN8n } from '../src/utils/n8n-importer.js';
import { validateWorkflowDefinition } from '../src/utils/workflow-validation.js';

const storageNodeTypes = ['list_files', 'binary_metadata', 's3_object'];
for (const nodeType of storageNodeTypes) {
  assert.equal(typeof getNodeHandler(nodeType), 'function', `${nodeType} should be registered`);
}

const filesRoot = path.join(process.cwd(), 'test', '.tmp-storage-smoke');
const workspaceId = 'workspace-storage-smoke';
process.env.OTTO_FILES_DIR = filesRoot;
await rm(filesRoot, { recursive: true, force: true });
await mkdir(filesRoot, { recursive: true });

try {
  await writeWorkspaceFile(workspaceId, 'inbox/a.txt', Buffer.from('alpha'));
  await writeWorkspaceFile(workspaceId, 'inbox/nested/b.json', Buffer.from('{"ok":true}'));

  const flatList = await listFiles({
    workspaceId,
    config: { path: 'inbox', pattern: '*.txt', recursive: 'false', includeDirectories: 'false' },
  });
  assert.equal(flatList.count, 1);
  assert.equal(flatList.files[0].path, 'inbox/a.txt');
  assert.equal(flatList.files[0].mimeType, 'text/plain');

  const recursiveList = await listFiles({
    workspaceId,
    config: { path: 'inbox', pattern: '*', recursive: 'true', includeDirectories: 'true', maxDepth: 5 },
  });
  assert.ok(recursiveList.files.some((file) => file.path === 'inbox/nested/b.json'));
  assert.ok(recursiveList.items.length >= recursiveList.count);

  const originalQuery = db.query;
  db.query = async (sql, params) => {
    if (String(sql).includes('ORDER BY created_at DESC')) {
      return {
        rows: [
          {
            id: 'bin_recent',
            file_name: 'recent.csv',
            mime_type: 'text/csv',
            size_bytes: 12,
            metadata: { source: 'test' },
            created_at: '2026-05-26T00:00:00.000Z',
          },
        ],
      };
    }
    return {
      rows: [
        {
          id: params[0],
          file_name: 'sample.txt',
          mime_type: 'text/plain',
          size_bytes: 5,
          metadata: { source: 'test' },
          created_at: '2026-05-26T00:00:00.000Z',
        },
      ],
    };
  };

  try {
    const inputRef = await binaryMetadata({
      workspaceId,
      input: { binary: { data: { id: 'bin_1', fileName: 'sample.txt', mimeType: 'text/plain', sizeBytes: 5 } } },
      config: { source: 'input', binaryProperty: 'data', lookup: 'false' },
    });
    assert.equal(inputRef.found, true);
    assert.equal(inputRef.binary.id, 'bin_1');

    const lookedUp = await binaryMetadata({
      workspaceId,
      input: {},
      config: { source: 'id', binaryId: 'bin_db', binaryProperty: 'data', lookup: 'true' },
    });
    assert.equal(lookedUp.found, true);
    assert.equal(lookedUp.binary.fileName, 'sample.txt');

    const recent = await binaryMetadata({
      workspaceId,
      input: {},
      config: { source: 'recent', limit: 5, mimeType: 'text/csv' },
    });
    assert.equal(recent.count, 1);
    assert.equal(recent.binaries[0].id, 'bin_recent');
  } finally {
    db.query = originalQuery;
  }

  const signed = signS3Request({
    method: 'GET',
    url: new URL('https://s3.example.test/my-bucket?list-type=2'),
    credentials: {
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret',
      region: 'us-east-1',
    },
    now: new Date('2026-05-26T00:00:00.000Z'),
  });
  assert.match(signed.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIA_TEST\/20260526\/us-east-1\/s3\/aws4_request/);

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === 'PUT') {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === 'etag' ? '"put-etag"' : null) },
        text: async () => '',
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>a.txt</Key><LastModified>2026-05-26T00:00:00.000Z</LastModified><ETag>"abc"</ETag><Size>5</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>',
    };
  };

  try {
    const listed = await s3Object({
      workspaceId,
      input: {},
      credential: null,
      config: {
        operation: 'list',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'secret',
        endpoint: 'https://s3.example.test',
        region: 'us-east-1',
        bucket: 'my-bucket',
        prefix: 'inbox/',
      },
    });
    assert.equal(listed.count, 1);
    assert.equal(listed.objects[0].key, 'a.txt');
    assert.ok(calls[0].url.includes('list-type=2'));
    assert.ok(calls[0].init.headers.Authorization);

    const put = await s3Object({
      workspaceId,
      input: { data: 'hello' },
      credential: null,
      config: {
        operation: 'put',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'secret',
        endpoint: 'https://s3.example.test',
        region: 'us-east-1',
        bucket: 'my-bucket',
        key: 'hello.txt',
        sourceField: 'data',
        contentType: 'text/plain',
      },
    });
    assert.equal(put.ok, true);
    assert.equal(put.eTag, 'put-etag');
    assert.equal(calls[1].init.method, 'PUT');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const imported = importN8n({
    name: 'Storage fixture',
    nodes: [
      {
        id: 's3',
        name: 'S3',
        type: 'n8n-nodes-base.s3',
        typeVersion: 1,
        position: [0, 0],
        parameters: { operation: 'upload', bucketName: 'my-bucket', fileKey: 'hello.txt', inputDataFieldName: 'data' },
      },
      {
        id: 'mysql',
        name: 'MySQL',
        type: 'n8n-nodes-base.mySql',
        typeVersion: 1,
        position: [160, 0],
        parameters: { query: 'SELECT 1' },
      },
    ],
    connections: {},
  });
  const byName = Object.fromEntries(imported.nodes.map((node) => [node.name, node]));
  assert.equal(byName.S3.type, 's3_object');
  assert.equal(byName.S3.config.operation, 'put');
  assert.equal(byName.MySQL.type, 'placeholder');
  assert.equal(byName.MySQL.config._ottoImport.status, 'unsupported');

  const validation = validateWorkflowDefinition({
    nodes: [
      { id: 'list', type: 'list_files', name: 'List', config: { path: '.' } },
      { id: 'meta', type: 'binary_metadata', name: 'Meta', config: { source: 'input', binaryProperty: 'data' } },
      { id: 's3', type: 's3_object', name: 'S3', config: { operation: 'list', bucket: 'my-bucket' } },
    ],
    edges: [],
  }, { requireIncoming: false });
  assert.equal(validation.errorCount, 0);
} finally {
  await rm(filesRoot, { recursive: true, force: true });
}

console.log('storage nodes smoke ok');
