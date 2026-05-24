const DEFAULT_VERSIONS = {
  javascript: '18.x',
  js: '18.x',
  node: '18.x',
  python: '3.11.x',
  py: '3.11.x',
  bash: '5.x',
  sh: '5.x',
};

const EXTENSIONS = {
  javascript: 'js',
  js: 'js',
  node: 'js',
  python: 'py',
  py: 'py',
  bash: 'sh',
  sh: 'sh',
};

function normalizeLanguage(language) {
  if (!language) return 'javascript';
  if (language === 'node') return 'javascript';
  if (language === 'py') return 'python';
  if (language === 'sh') return 'bash';
  return language;
}

function wrapJavaScript(code) {
  return `
const fs = require('fs');
const raw = fs.readFileSync(0, 'utf8');
const input = raw ? JSON.parse(raw) : {};

Promise.resolve((async (input) => {
${code}
})(input)).then((result) => {
  if (result !== undefined) {
    process.stdout.write(typeof result === 'string' ? result : JSON.stringify(result));
  }
}).catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
`.trim();
}

function parseStdout(stdout) {
  const trimmed = String(stdout ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export async function codeNode({ input, config }) {
  const pistonUrl = (process.env.PISTON_URL ?? 'http://localhost:2000').replace(/\/$/, '');
  const language = normalizeLanguage(String(config.language ?? 'javascript'));
  const version = String(config.version ?? DEFAULT_VERSIONS[language] ?? '*');
  const code = String(config.code ?? '');
  const timeoutMs = Math.min(Math.max(Number(config.timeoutMs ?? 5000), 100), 30_000);
  const memoryLimitMb = Math.min(Math.max(Number(config.memoryLimitMb ?? 128), 16), 512);
  const stdinMode = config.stdinMode ?? 'json';
  const wrap = config.wrap !== false && ['javascript', 'js', 'node'].includes(language);
  const filename = String(config.filename ?? `main.${EXTENSIONS[language] ?? 'txt'}`);

  if (!code.trim()) throw new Error('Code node: code is required');

  const body = {
    language,
    version,
    files: [{ name: filename, content: wrap ? wrapJavaScript(code) : code }],
    stdin: stdinMode === 'json' ? JSON.stringify(input ?? {}) : String(config.stdin ?? ''),
    args: Array.isArray(config.args) ? config.args : [],
    run_timeout: timeoutMs,
    compile_timeout: timeoutMs,
    run_memory_limit: memoryLimitMb * 1024 * 1024,
    compile_memory_limit: memoryLimitMb * 1024 * 1024,
  };

  const res = await fetch(`${pistonUrl}/api/v2/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => {
    throw new Error(`Code node: could not reach Piston at ${pistonUrl}: ${err.message}`);
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Code node: Piston rejected execution: ${payload.message ?? res.statusText}`);
  }

  const compile = payload.compile ?? null;
  if (compile && (compile.code !== 0 || compile.signal)) {
    throw new Error(`Code node compile failed: ${compile.stderr || compile.output || compile.signal || 'unknown error'}`);
  }

  const run = payload.run ?? {};
  if (run.code !== 0 || run.signal) {
    throw new Error(`Code node failed: ${run.stderr || run.output || run.signal || `exit ${run.code}`}`);
  }

  return {
    language: payload.language ?? language,
    version: payload.version ?? version,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    output: run.output ?? '',
    exitCode: run.code ?? null,
    signal: run.signal ?? null,
    result: parseStdout(run.stdout),
  };
}
