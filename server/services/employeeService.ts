import { db, User, Expense, generateSalt, hashPassword } from '../db.ts';
import { LocalDb } from '../localDb.ts';
import { SupabaseDb } from '../supabaseDb.ts';
import { isSupabaseConfigured } from '../supabaseClient.ts';
import { AuditService } from './auditService.ts';
import { safeUser } from './authService.ts';
import crypto from 'crypto';

export class EmployeeService {
  /**
   * List staff records. Only returns developer profiles if the requesting caller is a DEVELOPER.
   * Admins and store users only see cloud staff accounts.
   */
  static async listEmployees(storeId: string, requestingUserRole?: string) {
    const cloudList = await SupabaseDb.listEmployees(storeId).catch(() => []);

    // Developer profile is only visible to the developer themselves
    let localDevelopers: User[] = [];
    if (requestingUserRole === 'DEVELOPER') {
      try {
        const localUsers = await LocalDb.getUsers(storeId);
        localDevelopers = localUsers.filter(u => u.role === 'DEVELOPER');
      } catch (_) {}
    }

    const all = [...localDevelopers, ...cloudList];
    return all.map(u => safeUser(u));
  }

  static async createEmployee(storeId: string, adminUserId: string, adminUserName: string, payload: {
    username?: string;
    name?: string;
    email?: string;
    password: string;
    role?: 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER';
  }) {
    const rawUsername = (payload.username || payload.name || '').trim();
    if (!rawUsername) throw new Error('Username is required');

    // Canonical email formatting for Supabase schema compliance
    const canonicalEmail = payload.email && payload.email.includes('@')
      ? payload.email.trim().toLowerCase()
      : `${rawUsername.toLowerCase()}@fryfreeze.com`;

    if (!payload.password || payload.password.length < 4) {
      throw new Error('Password must be at least 4 characters long');
    }

    let assignedRole: 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER' = 'EMPLOYEE';
    if (payload.role === 'DEVELOPER') assignedRole = 'DEVELOPER';
    else if (payload.role === 'ADMIN') assignedRole = 'ADMIN';

    const salt = generateSalt();
    const passwordHash = hashPassword(payload.password, salt);
    const now = new Date().toISOString();

    const newEmp: User = {
      id: crypto.randomUUID(),
      store_id: storeId,
      name: rawUsername,
      email: canonicalEmail,
      password_hash: passwordHash,
      salt,
      role: assignedRole,
      active: true,
      created_by: adminUserId || undefined,
      created_at: now,
      updated_at: now,
    };

    // 1. DEVELOPER PROFILE: Store strictly in LOCAL SQLite (never in cloud)
    if (assignedRole === 'DEVELOPER') {
      const existingLocal = await LocalDb.getUserByEmail(rawUsername);
      if (existingLocal) {
        throw new Error(`Developer username "${rawUsername}" is already taken in the local database`);
      }
      const saved = await LocalDb.createUser(newEmp);
      AuditService.log({
        storeId, userId: adminUserId, userName: adminUserName,
        action: 'USER_CREATED', entityType: 'USER', entityId: saved.id,
        afterData: { username: saved.name, role: saved.role, storage: 'LOCAL_SQLITE' },
      });
      return safeUser(saved);
    }

    // 2. ADMIN & EMPLOYEE: Store strictly in Supabase Cloud
    const existing = await SupabaseDb.getUserByEmail(rawUsername);
    if (existing) {
      throw new Error(`Username "${rawUsername}" is already taken in the cloud database`);
    }

    const saved = await SupabaseDb.createUser(newEmp);
    AuditService.log({
      storeId, userId: adminUserId, userName: adminUserName,
      action: 'USER_CREATED', entityType: 'USER', entityId: saved.id,
      afterData: { username: saved.name, role: saved.role, storage: 'SUPABASE_CLOUD' },
    });
    return safeUser(saved);
  }

  static async setEmployeeActive(storeId: string, adminUserId: string, adminUserName: string, employeeId: string, active: boolean) {
    if (adminUserId === employeeId) {
      throw new Error('You cannot deactivate your own admin account');
    }

    const now = new Date().toISOString();

    // Check if user is a local developer in SQLite
    const localUsers = await LocalDb.getUsers(storeId).catch(() => []);
    const localMatch = localUsers.find(u => u.id === employeeId);
    if (localMatch) {
      const updated = await LocalDb.updateUser(employeeId, { active, updated_at: now });
      AuditService.log({
        storeId, userId: adminUserId, userName: adminUserName,
        action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'USER', entityId: employeeId,
        beforeData: { active: localMatch.active }, afterData: { active, storage: 'LOCAL_SQLITE' },
      });
      return safeUser(updated);
    }

    const user = await SupabaseDb.getUserById(employeeId);
    if (!user) throw new Error('User not found in Supabase or local storage');

    const beforeActive = user.active;

    // Update active status directly in Supabase Cloud (Kill-switch control)
    const updated = await SupabaseDb.updateUser(employeeId, { active, updated_at: now });

    AuditService.log({
      storeId, userId: adminUserId, userName: adminUserName,
      action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'USER', entityId: employeeId,
      beforeData: { active: beforeActive }, afterData: { active },
    });

    return safeUser(updated);
  }

  static async resetEmployeePassword(storeId: string, adminUserId: string, adminUserName: string, employeeId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(newPassword, salt);
    const now = new Date().toISOString();

    // Check local SQLite first
    const localUsers = await LocalDb.getUsers(storeId).catch(() => []);
    const localMatch = localUsers.find(u => u.id === employeeId);
    if (localMatch) {
      const updated = await LocalDb.updateUser(employeeId, { password_hash: passwordHash, salt, updated_at: now });
      AuditService.log({
        storeId, userId: adminUserId, userName: adminUserName,
        action: 'USER_PASSWORD_RESET', entityType: 'USER', entityId: employeeId,
      });
      return safeUser(updated);
    }

    const user = await SupabaseDb.getUserById(employeeId);
    if (!user) throw new Error('User not found in Supabase or local storage');

    // Update password strictly in Supabase Cloud
    const updated = await SupabaseDb.updateUser(employeeId, { password_hash: passwordHash, salt, updated_at: now });

    AuditService.log({
      storeId, userId: adminUserId, userName: adminUserName,
      action: 'USER_PASSWORD_RESET', entityType: 'USER', entityId: employeeId,
    });

    return safeUser(updated);
  }

  static async deleteEmployee(storeId: string, adminUserId: string, adminUserName: string, employeeId: string) {
    if (adminUserId === employeeId) {
      throw new Error('You cannot delete your own admin account');
    }

    // Check local SQLite first
    const localUsers = await LocalDb.getUsers(storeId).catch(() => []);
    const localMatch = localUsers.find(u => u.id === employeeId);
    if (localMatch) {
      await LocalDb.deleteUser(employeeId);
      AuditService.log({
        storeId, userId: adminUserId, userName: adminUserName,
        action: 'USER_DELETED', entityType: 'USER', entityId: employeeId,
        beforeData: { name: localMatch.name, email: localMatch.email, role: localMatch.role, storage: 'LOCAL_SQLITE' },
      });
      return { success: true, message: `Developer account "${localMatch.name}" removed from local storage` };
    }

    const user = await SupabaseDb.getUserById(employeeId);
    if (!user) throw new Error('Staff member not found in Supabase');

    // Remove strictly from Supabase Cloud
    await SupabaseDb.deleteUser(employeeId);

    AuditService.log({
      storeId, userId: adminUserId, userName: adminUserName,
      action: 'USER_DELETED', entityType: 'USER', entityId: employeeId,
      beforeData: { name: user.name, email: user.email, role: user.role },
    });

    return { success: true, message: `Staff member "${user.name}" removed` };
  }
}

export class ExpenseService {
  static listExpenses(storeId: string, options?: { from?: string; to?: string }) {
    let list = db.expenses.filter(e => e.store_id === storeId);
    if (options?.from) list = list.filter(e => e.expense_date >= options.from!);
    if (options?.to) list = list.filter(e => e.expense_date <= options.to!);
    return list;
  }

  static async createExpense(storeId: string, userId: string, userName: string, payload: {
    category: string;
    amount: number;
    description: string;
    expenseDate?: string;
  }) {
    const amt = Number(payload.amount);
    if (isNaN(amt) || amt <= 0) throw new Error('Expense amount must be greater than zero');
    if (!payload.category?.trim()) throw new Error('Expense category is required');

    const now = new Date().toISOString();
    const expDate = payload.expenseDate || now.split('T')[0];

    const newExp: Omit<Expense, 'id' | 'created_at'> = {
      store_id: storeId,
      created_by: userId,
      created_by_name: userName,
      category: payload.category.trim(),
      amount: amt,
      description: payload.description?.trim() || '',
      expense_date: expDate,
      status: 'ACTIVE',
    };

    if (isSupabaseConfigured) {
      const saved = await SupabaseDb.createExpense(newExp);
      db.expenses.unshift(saved);
      AuditService.log({
        storeId, userId, userName, action: 'EXPENSE_CREATED', entityType: 'EXPENSE', entityId: saved.id,
        afterData: { category: saved.category, amount: saved.amount, date: saved.expense_date },
      });
      return saved;
    }

    const saved = await LocalDb.createExpense(newExp);
    db.expenses.unshift(saved);
    AuditService.log({
      storeId, userId, userName, action: 'EXPENSE_CREATED', entityType: 'EXPENSE', entityId: saved.id,
      afterData: { category: saved.category, amount: saved.amount, date: saved.expense_date },
    });
    return saved;
  }

  static async voidExpense(storeId: string, userId: string, userName: string, expenseId: string) {
    const exp = db.expenses.find(e => e.id === expenseId && e.store_id === storeId);
    if (!exp) throw new Error('Expense record not found');
    if (exp.status === 'VOIDED') throw new Error('Expense is already voided');

    exp.status = 'VOIDED';

    if (isSupabaseConfigured) {
      await SupabaseDb.voidExpense(expenseId);
    } else {
      await LocalDb.voidExpense(expenseId);
    }

    AuditService.log({
      storeId, userId, userName, action: 'EXPENSE_VOIDED', entityType: 'EXPENSE', entityId: exp.id,
      afterData: { category: exp.category, amount: exp.amount, status: 'VOIDED' },
    });

    return exp;
  }
}
