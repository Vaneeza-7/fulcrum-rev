import { neon } from '@neondatabase/serverless';

function getMonitoringSql() {
  const url = process.env.MONITORING_DATABASE_URL;
  if (!url) throw new Error('MONITORING_DATABASE_URL is not set');
  return neon(url);
}

/**
 * Dismiss a quarantine event (resolve it as not actionable).
 */
export async function dismissAlert(alertId: string, userId: string): Promise<void> {
  const sql = getMonitoringSql();

  await sql`
    UPDATE quarantine_events
    SET resolved = true,
        resolved_by = ${userId},
        resolved_at = NOW(),
        resolution_notes = 'Dismissed via Slack'
    WHERE id = ${Number(alertId)} AND resolved = false
  `;

  await sql`
    INSERT INTO system_audit_trail (event_type, actor_type, actor_id, resource_type, resource_id, action, details)
    VALUES ('quarantine.dismissed', 'user', ${userId}, 'quarantine_event', ${alertId}, 'DISMISS', ${{}}::jsonb)
  `;
}

/**
 * Acknowledge an alert (mark as seen, stop re-alerting for this event).
 */
export async function acknowledgeAlert(alertId: string, userId: string): Promise<void> {
  const sql = getMonitoringSql();

  await sql`
    UPDATE quarantine_events
    SET resolved = true,
        resolved_by = ${userId},
        resolved_at = NOW(),
        resolution_notes = 'Acknowledged via Slack'
    WHERE id = ${Number(alertId)} AND resolved = false
  `;

  await sql`
    INSERT INTO system_audit_trail (event_type, actor_type, actor_id, resource_type, resource_id, action, details)
    VALUES ('quarantine.acknowledged', 'user', ${userId}, 'quarantine_event', ${alertId}, 'ACKNOWLEDGE', ${{}}::jsonb)
  `;
}

/**
 * Check if a resource was dismissed in the last 24 hours.
 * Used to prevent re-alerting on the same resource shortly after dismissal.
 */
export async function isRecentlyDismissed(resourceId: string): Promise<boolean> {
  const sql = getMonitoringSql();

  const rows = await sql`
    SELECT 1 FROM quarantine_events
    WHERE resource_id = ${resourceId}
      AND resolved = true
      AND resolution_notes IN ('Dismissed via Slack', 'Acknowledged via Slack')
      AND resolved_at > NOW() - INTERVAL '24 hours'
    LIMIT 1
  `;

  return rows.length > 0;
}

/**
 * Auto-resolve a quarantine event that was skipped due to dismiss cooldown.
 */
export async function autoResolveAlert(alertId: string, resourceId: string): Promise<void> {
  const sql = getMonitoringSql();

  await sql`
    UPDATE quarantine_events
    SET resolved = true,
        resolved_at = NOW(),
        resolution_notes = 'Auto-resolved: dismiss cooldown active'
    WHERE id = ${Number(alertId)} AND resolved = false
  `;

  await sql`
    INSERT INTO system_audit_trail (event_type, actor_type, actor_id, resource_type, resource_id, action, details)
    VALUES ('quarantine.auto_resolved', 'system', 'dismiss_cooldown', 'quarantine_event', ${alertId}, 'AUTO_RESOLVE',
      ${JSON.stringify({ resource_id: resourceId, reason: 'dismiss_cooldown' })}::jsonb)
  `;
}

export async function suppressResource(
  resourceId: string,
  resourceName: string,
  userId: string
): Promise<void> {
  const sql = getMonitoringSql();

  // Upsert suppression into workflow_baselines
  await sql`
    INSERT INTO workflow_baselines (workflow_id, workflow_name, platform, suppressed, suppressed_by, suppressed_reason, suppressed_until, created_at)
    VALUES (${resourceId}, ${resourceName}, 'neon', true, ${userId}, ${'Suppressed via Slack by ' + userId}, '2099-12-31T00:00:00Z', NOW())
    ON CONFLICT (workflow_id) DO UPDATE SET
      suppressed = true,
      suppressed_by = ${userId},
      suppressed_reason = ${'Suppressed via Slack by ' + userId},
      suppressed_until = '2099-12-31T00:00:00Z'
  `;

  // Resolve all open alerts for this resource
  await sql`
    UPDATE quarantine_events
    SET resolved = true,
        resolved_by = ${userId},
        resolved_at = NOW(),
        resolution_notes = 'Auto-resolved: resource suppressed'
    WHERE resource_id = ${resourceId} AND resolved = false
  `;

  await sql`
    INSERT INTO system_audit_trail (event_type, actor_type, actor_id, resource_type, resource_id, action, details)
    VALUES ('resource.suppressed', 'user', ${userId}, 'workflow_baseline', ${resourceId}, 'SUPPRESS', ${JSON.stringify({ resource_name: resourceName })}::jsonb)
  `;
}
