import { getCredential } from '../engine/credentials.js';
import { llmCall } from './llm-call.js';

const DEFAULT_TARGETS = [
  { id: 'openai_fast', provider: 'openai', model: 'gpt-4o-mini' },
  { id: 'anthropic_fast', provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
];

function parseTargets(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return DEFAULT_TARGETS;
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) throw new Error('targetsJson must be a JSON array');
    return parsed;
  } catch (err) {
    throw new Error(`Parallel AI: invalid targets JSON: ${err.message}`);
  }
}

function parsePositiveInt(value, fallback, min = 1, max = 300_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function branchId(target, index) {
  const raw = target.id ?? target.name ?? `${target.provider ?? 'model'}_${index + 1}`;
  return String(raw).trim() || `branch_${index + 1}`;
}

function withTimeout(promise, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Parallel AI branch "${label}" exceeded timeout of ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function credentialForTarget(target, sharedCredential, ctx, workspaceId) {
  if (!target.credentialId) return sharedCredential;
  return getCredential(target.credentialId, {
    workflowId: ctx?.workflowId,
    nodeId: ctx?.nodeId,
    workspaceId,
  });
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

export async function parallelAi({ config, credential, workspaceId, ctx }) {
  const targets = parseTargets(config.targets ?? config.targetsJson);
  if (!targets.length) throw new Error('Parallel AI: at least one target is required');

  const defaultPrompt = config.userPrompt ?? config.prompt ?? '{{ input }}';
  const defaultSystemPrompt = config.systemPrompt ?? '';
  const defaultTemperature = config.temperature ?? 0.7;
  const defaultMaxTokens = config.maxTokens ?? 1000;
  const timeoutMs = parsePositiveInt(config.timeoutMs, 60_000, 100, 300_000);
  const failureMode = String(config.failureMode ?? 'all_failed');
  const startedAt = Date.now();

  const settled = await Promise.all(targets.map(async (target, index) => {
    if (!target || typeof target !== 'object') {
      throw new Error(`Parallel AI: target ${index + 1} must be an object`);
    }

    const id = branchId(target, index);
    const provider = String(target.provider ?? config.provider ?? 'openai');
    const model = String(target.model ?? config.model ?? (provider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini'));
    const started = Date.now();

    try {
      const targetCredential = await credentialForTarget(target, credential, ctx, workspaceId);
      const response = await withTimeout(
        llmCall({
          config: {
            provider,
            model,
            systemPrompt: target.systemPrompt ?? defaultSystemPrompt,
            userPrompt: target.userPrompt ?? target.prompt ?? defaultPrompt,
            temperature: target.temperature ?? defaultTemperature,
            maxTokens: target.maxTokens ?? defaultMaxTokens,
          },
          credential: targetCredential,
        }),
        parsePositiveInt(target.timeoutMs, timeoutMs, 100, 300_000),
        id
      );

      return {
        id,
        name: target.name ?? id,
        provider,
        model,
        status: 'success',
        durationMs: Date.now() - started,
        text: response.text ?? '',
        usage: response.usage ?? null,
        finishReason: response.finishReason ?? null,
        raw: response,
      };
    } catch (err) {
      return {
        id,
        name: target.name ?? id,
        provider,
        model,
        status: 'error',
        durationMs: Date.now() - started,
        error: errorMessage(err),
      };
    }
  }));

  const successes = settled.filter((result) => result.status === 'success');
  const failures = settled.filter((result) => result.status === 'error');
  const fastest = successes.slice().sort((a, b) => a.durationMs - b.durationMs)[0] ?? null;
  const texts = Object.fromEntries(successes.map((result) => [result.id, result.text]));

  if (failureMode === 'any_failed' && failures.length > 0) {
    throw new Error(`Parallel AI: ${failures.length}/${settled.length} branches failed: ${failures.map((f) => `${f.id}: ${f.error}`).join('; ')}`);
  }
  if (failureMode !== 'never' && successes.length === 0) {
    throw new Error(`Parallel AI: all branches failed: ${failures.map((f) => `${f.id}: ${f.error}`).join('; ')}`);
  }

  return {
    branchCount: settled.length,
    successCount: successes.length,
    errorCount: failures.length,
    durationMs: Date.now() - startedAt,
    fastest,
    winner: fastest,
    texts,
    results: settled,
  };
}
