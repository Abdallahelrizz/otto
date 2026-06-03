// src/utils/redirect-auth.js
const AUTH_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie']);

/**
 * Returns the options to use when following a redirect. If the redirect target
 * resolves to a different host than the source, auth-bearing headers are removed
 * (matching browser behavior) so credentials are never sent to a new origin.
 * Pure: never mutates the input.
 */
export function stripAuthAcrossHost(options, fromUrl, toUrl) {
  let sameHost;
  try {
    sameHost = new URL(toUrl, fromUrl).host === new URL(fromUrl).host;
  } catch {
    sameHost = false; // unparseable target → treat as cross-host (safer)
  }
  if (sameHost) return options;

  const headers = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (!AUTH_HEADERS.has(key.toLowerCase())) headers[key] = value;
  }
  return { ...options, headers };
}
