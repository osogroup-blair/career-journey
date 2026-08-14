import type { App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { generateId } from '../src/lib/utils';

export interface AdminAuditLog {
  id: string;
  actorUid: string;
  actorEmail?: string | null;
  targetUid: string;
  targetEmail?: string | null;
  action:
    | 'update_plan'
    | 'reset_quota'
    | 'set_comp'
    | 'set_status'
    | 'send_reset'
    | 'delete_user'
    | 'grant_admin'
    | 'revoke_admin';
  details: Record<string, any>;
  timestamp: string;
}

/**
 * Logs an administrative event to the Firestore `admin_audit_logs` collection.
 */
export async function logAdminAction(
  adminApp: App,
  event: Omit<AdminAuditLog, 'id' | 'timestamp'>
): Promise<AdminAuditLog> {
  const db = getFirestore(adminApp);
  const logEntry: AdminAuditLog = {
    id: `audit_${Date.now()}_${generateId().slice(0, 8)}`,
    ...event,
    timestamp: new Date().toISOString(),
  };

  try {
    await db.collection('admin_audit_logs').doc(logEntry.id).set(logEntry);
  } catch (err) {
    console.error('Failed to write admin audit log:', err);
  }

  return logEntry;
}

/**
 * Lists the most recent administrative audit logs.
 */
export async function listAuditLogs(
  adminApp: App,
  limitCount = 50
): Promise<AdminAuditLog[]> {
  const db = getFirestore(adminApp);
  try {
    const snap = await db
      .collection('admin_audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(limitCount)
      .get();

    return snap.docs.map((doc) => doc.data() as AdminAuditLog);
  } catch (err) {
    // If the composite index hasn't been created yet, fall back to fetching without order
    const snap = await db.collection('admin_audit_logs').limit(limitCount).get();
    const logs = snap.docs.map((doc) => doc.data() as AdminAuditLog);
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}
