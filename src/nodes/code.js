const DEFAULT_VERSIONS = {
  javascript: '18.x',
  js:         '18.x',
  node:       '18.x',
  typescript: '5.x',
  ts:         '5.x',
  python:     '3.11.x',
  py:         '3.11.x',
  bash:       '5.x',
  sh:         '5.x',
  go:         '1.16.2',
  ruby:       '3.3.0',
  rb:         '3.3.0',
  rust:       '1.73.0',
  rs:         '1.73.0',
  php:        '8.2.3',
  c:          '10.2.0',
  cpp:        '10.2.0',
  'c++':      '10.2.0',
};

const EXTENSIONS = {
  javascript: 'js',
  js:         'js',
  node:       'js',
  typescript: 'ts',
  ts:         'ts',
  python:     'py',
  py:         'py',
  bash:       'sh',
  sh:         'sh',
  go:         'go',
  ruby:       'rb',
  rb:         'rb',
  rust:       'rs',
  rs:         'rs',
  php:        'php',
  c:          'c',
  cpp:        'cpp',
  'c++':      'cpp',
};

function normalizeLanguage(language) {
  if (!language) return 'javascript';
  if (language === 'node') return 'javascript';
  if (language === 'py') return 'python';
  if (language === 'sh') return 'bash';
  if (language === 'ts') return 'typescript';
  if (language === 'rb') return 'ruby';
  if (language === 'rs') return 'rust';
  if (language === 'c++') return 'cpp';
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

const PUBLIC_PISTON = 'https://emkc.org/api/v2/piston';

export async function codeNode({ input, config }) {
  const primaryUrl = (process.env.PISTON_URL ?? 'http://localhost:2000').replace(/\/$/, '');
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

  // The public emkc.org fallback sends the user's CODE and INPUT DATA off-box, so it
  // is OPT-IN only. Set PISTON_ALLOW_PUBLIC=true to enable it; otherwise an unreachable
  // Piston is a hard error rather than a silent third-party exfiltration.
  const allowPublic = process.env.PISTON_ALLOW_PUBLIC === 'true';
  async function executePiston(url) {
    const res = await fetch(`${url}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res;
  }

  let res;
  try {
    res = await executePiston(`${primaryUrl}/api/v2`);
  } catch (primaryErr) {
    if (!allowPublic) {
      throw new Error(`Code node: Piston is unreachable at ${primaryUrl}. Point PISTON_URL at a reachable Piston, or set PISTON_ALLOW_PUBLIC=true to allow the public emkc.org fallback (which sends your code and input off-box).`);
    }
    // Explicitly opted in — try public Piston
    try {
      res = await executePiston(PUBLIC_PISTON);
    } catch (err2) {
      throw new Error(`Code node: could not reach Piston (tried ${primaryUrl} and public fallback): ${err2.message}`);
    }
  }

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
