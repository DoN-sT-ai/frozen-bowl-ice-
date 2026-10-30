import { db, AuditLog } from '../db.ts';
import { LocalDb } from '../localDb.ts';
import crypto from 'crypto';

export class AuditService {
  static log(params: {
    storeId: string;
    userId?: string;
    userName?: string;
    action: string;
    entityType: string;
    entityId?: string;
    beforeData?: any;
    afterData?: any;
    ipAddress?: string;
    userAgent?: string;
  }): AuditLog {
    const entry: AuditLog = {
      id: crypto.randomUUID(),
      store_id: params.storeId,
      user_id: params.userId,
      user_name: params.userName,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      before_data: params.beforeData,
      after_data: params.afterData,
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      created_at: new Date().toISOString(),
    };

    db.audit_logs.unshift(entry);
    // Keep reasonable in-memory cap for speed
    if (db.audit_logs.length > 5000) {
      db.audit_logs.pop();
    }
    LocalDb.createAuditLog(entry).catch(() => {});
    return entry;
  }

  static getLogs(storeId: string, filter?: { action?: string; entityType?: string; limit?: number }) {
    let logs = db.audit_logs.filter(l => l.store_id === storeId);
    if (filter?.action) {
      logs = logs.filter(l => l.action.toLowerCase().includes(filter.action!.toLowerCase()));
    }
    if (filter?.entityType) {
      logs = logs.filter(l => l.entity_type.toLowerCase() === filter.entityType!.toLowerCase());
    }
    const limit = filter?.limit || 100;
    return logs.slice(0, limit);
  }
}
