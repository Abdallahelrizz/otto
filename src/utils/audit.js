import { db } from '../db/client.js';

/**
 * Write an audit event to audit_log.
 * Fails silently — audit errors must never crash the main request flow.
 *
 * @param {object} opts
 * @param {string}  [opts.workspaceId]
 * @param {string}  [opts.userId]
 * @param {string}   opts.action          - e.g. 'credential.create'
 * @param {string}  [opts.resourceType]   - e.g. 'credential'
 * @param {string}  [opts.resourceId]
 * @param {object}  [opts.metadata]       - arbitrary extra context
 * @param {string}  [opts.ip]             - req.ip
 * @param {string}  [opts.userAgent]      - req.headers['user-agent']
 */
export async function auditLog(opts) {
  try {
    await db.query(
      `INSERT INTO audit_log
         (workspace_id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        opts.workspaceId ?? null,
        opts.userId      ?? null,
        opts.action,
        opts.resourceType ?? null,
        opts.resourceId   ?? null,
        JSON.stringify(opts.metadata ?? {}),
        opts.ip        ?? null,
        opts.userAgent ?? null,
      ]
    );
  } catch {
    // never crash on audit failure
  }
}
