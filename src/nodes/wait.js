import { WAIT } from '../engine/wait.js';

const MAX_DURATION_DAYS = 30;
const MAX_DURATION_SECONDS = MAX_DURATION_DAYS * 24 * 60 * 60;

export async function waitNode({ config }) {
  const waitType = config.wait_type ?? config.waitType;
  if (!waitType || !['time', 'webhook', 'form'].includes(waitType)) {
    throw new Error(`Wait: wait_type must be 'time', 'webhook', or 'form'. Got: ${waitType}`);
  }

  if (waitType === 'time') {
    const secs = Number(config.duration_seconds ?? config.durationSeconds);
    if (!Number.isFinite(secs) || secs <= 0) {
      throw new Error('Wait: duration_seconds must be a positive number for wait_type=time');
    }
    if (secs > MAX_DURATION_SECONDS) {
      throw new Error(`Wait: duration_seconds cannot exceed ${MAX_DURATION_DAYS} days (${MAX_DURATION_SECONDS}s)`);
    }
  }

  return {
    [WAIT]: true,
    waitType,
    durationSeconds: waitType === 'time' ? Number(config.duration_seconds ?? config.durationSeconds) : null,
    timeoutSeconds: config.timeout_seconds ? Number(config.timeout_seconds) : null,
    resumeAuth: config.resume_authentication ?? 'none',
    formPath: config.form_path ?? null,
    formFields: config.form_fields ?? null,
  };
}
