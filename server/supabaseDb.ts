import { LocalDb } from './localDb.ts';
import { supabase, isSupabaseConfigured } from './supabaseClient.ts';
import type { User, Store } from './db.ts';

export interface CloudStore {
  id: string;
  name: string;
  code: string;
  active: boolean;
  status: string; // 'ACTIVE', 'STOPPED', 'INACTIVE', 'SUSPENDED'
  is_blocked?: boolean;
  plan_status?: string; // 'ACTIVE', 'EXPIRED', 'TRIAL'
  plan_expires_at?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  currency?: string;
  timezone?: string;
  invoice_prefix?: string;
  is_stopped: boolean;
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CloudUser extends User {
  store_name?: string | null;
  store_status?: string | null;
  store_active?: boolean;
  is_blocked?: boolean;
  is_store_stopped?: boolean;
  status?: string;
}

export class SupabaseDb {
  private static checkSupabase() {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase Cloud Authentication is required. No local fallback is allowed. Please configure SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env'
      );
    }
    return supabase;
  }

  // ============================================================
  // USER AUTHENTICATION & MANAGEMENT (100% SUPABASE ONLY)
  // Strictly no local fallback or local storage of user credentials.
  // ============================================================

  static async getUserByEmail(emailOrUsername: string): Promise<CloudUser | null> {
    const client = this.checkSupabase();
    const clean = emailOrUsername.trim().toLowerCase();

    let queryResult: any;
    try {
      const isEmail = clean.includes('@');
      if (isEmail) {
        queryResult = await client.from('users').select('*').ilike('email', clean).maybeSingle();
      } else {
        queryResult = await client.from('users').select('*').ilike('name', clean).maybeSingle();
        if (!queryResult.data) {
          queryResult = await client.from('users').select('*').ilike('email', clean).maybeSingle();
        }
      }
    } catch (networkErr: any) {
      console.warn('[Supabase] Offline network error:', networkErr?.message || networkErr);
      throw new Error('No internet connection. Please connect to the internet to log in to your store account, or use Developer offline mode.');
    }

    const { data, error } = queryResult;

    if (error) {
      throw new Error(`Supabase User Query Error: ${error.message}`);
    }

    if (!data) return null;

    const isUserBlocked =
      data.is_blocked === true ||
      data.active === false ||
      String(data.status || '').toUpperCase() === 'BLOCKED' ||
      String(data.status || '').toUpperCase() === 'INACTIVE' ||
      String(data.status || '').toUpperCase() === 'SUSPENDED';

    const isStoreStoppedOnUser =
      data.store_active === false ||
      data.is_store_active === false ||
      ['STOPPED', 'INACTIVE', 'BLOCKED', 'SUSPENDED', 'EXPIRED'].includes(String(data.store_status || '').toUpperCase()) ||
      String(data.plan_status || '').toUpperCase() === 'EXPIRED';

    return {
      id: data.id,
      store_id: data.store_id || 'a0000000-0000-0000-0000-000000000001',
      store_name: data.store_name || null,
      store_status: data.store_status || null,
      store_active: data.store_active !== false,
      name: data.name || data.email,
      email: data.email,
      password_hash: data.password_hash || data.password || '',
      salt: data.salt || '',
      role: (['ADMIN', 'DEVELOPER'].includes(data.role?.toUpperCase()) ? data.role.toUpperCase() : 'EMPLOYEE') as 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER',
      active: !isUserBlocked && !isStoreStoppedOnUser,
      is_blocked: isUserBlocked,
      is_store_stopped: isStoreStoppedOnUser,
      status: data.status,
      last_login_at: data.last_login_at,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || data.created_at || new Date().toISOString(),
    };
  }

  static async getUserById(id: string): Promise<CloudUser | null> {
    const client = this.checkSupabase();
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;

    const isUserBlocked =
      data.is_blocked === true ||
      data.active === false ||
      String(data.status || '').toUpperCase() === 'BLOCKED' ||
      String(data.status || '').toUpperCase() === 'INACTIVE' ||
      String(data.status || '').toUpperCase() === 'SUSPENDED';

    const isStoreStoppedOnUser =
      data.store_active === false ||
      data.is_store_active === false ||
      ['STOPPED', 'INACTIVE', 'BLOCKED', 'SUSPENDED', 'EXPIRED'].includes(String(data.store_status || '').toUpperCase()) ||
      String(data.plan_status || '').toUpperCase() === 'EXPIRED';

    return {
      id: data.id,
      store_id: data.store_id || 'a0000000-0000-0000-0000-000000000001',
      store_name: data.store_name || null,
      store_status: data.store_status || null,
      store_active: data.store_active !== false,
      name: data.name || data.email,
      email: data.email,
      password_hash: data.password_hash || data.password || '',
      salt: data.salt || '',
      role: (['ADMIN', 'DEVELOPER'].includes(data.role?.toUpperCase()) ? data.role.toUpperCase() : 'EMPLOYEE') as 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER',
      active: !isUserBlocked && !isStoreStoppedOnUser,
      is_blocked: isUserBlocked,
      is_store_stopped: isStoreStoppedOnUser,
      status: data.status,
      last_login_at: data.last_login_at,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || data.created_at || new Date().toISOString(),
    };
  }

  static async listEmployees(storeId: string): Promise<User[]> {
    const client = this.checkSupabase();
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list employees from Supabase: ${error.message}`);
    }

    return (data || []).map((u: any) => ({
      id: u.id,
      store_id: u.store_id,
      name: u.name,
      email: u.email,
      password_hash: u.password_hash || '',
      salt: u.salt || '',
      role: (['ADMIN', 'DEVELOPER'].includes(u.role?.toUpperCase()) ? u.role.toUpperCase() : 'EMPLOYEE') as 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER',
      active: u.active !== false && u.is_blocked !== true,
      last_login_at: u.last_login_at,
      created_at: u.created_at,
      updated_at: u.updated_at,
    }));
  }

  static async createUser(user: User, storeName?: string): Promise<User> {
    const client = this.checkSupabase();
    const insertPayload: Record<string, any> = {
      id: user.id,
      store_id: user.store_id,
      name: user.name,
      email: user.email,
      password_hash: user.password_hash,
      salt: user.salt,
      role: user.role,
      active: user.active !== false,
      is_blocked: false,
      status: 'ACTIVE',
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    if (storeName) {
      insertPayload.store_name = storeName;
    }

    let insertRes = await client.from('users').insert(insertPayload).select().single();

    // If store_name column doesn't exist yet in Supabase schema cache, gracefully retry without it
    if (insertRes.error && insertPayload.store_name && (insertRes.error.code === 'PGRST204' || insertRes.error.message?.includes('store_name'))) {
      delete insertPayload.store_name;
      insertRes = await client.from('users').insert(insertPayload).select().single();
    }

    if (insertRes.error) {
      throw new Error(`Failed to create employee in Supabase: ${insertRes.error.message}`);
    }

    const data = insertRes.data;
    return {
      id: data.id,
      store_id: data.store_id,
      name: data.name,
      email: data.email,
      password_hash: data.password_hash,
      salt: data.salt,
      role: data.role,
      active: data.active !== false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const client = this.checkSupabase();
    const { data, error } = await client
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update user in Supabase: ${error.message}`);
    }

    return data as User;
  }

  static async deleteUser(id: string): Promise<void> {
    const client = this.checkSupabase();
    const { error } = await client.from('users').delete().eq('id', id);
    if (error) {
      throw new Error(`Failed to delete user in Supabase: ${error.message}`);
    }
  }

  // ============================================================
  // MULTI-STORE MANAGEMENT & REMOTE STOP (SUPABASE CLOUD)
  // Each shop (e.g. "Frozen Bowl", "2ice") is tracked in Supabase.
  // Stopping a store immediately blocks all associated users.
  // ============================================================

  static async getStoreFromCloud(storeIdOrName: string): Promise<CloudStore | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    const client = supabase;
    const trimmed = (storeIdOrName || '').trim();
    if (!trimmed) return null;

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
      let data: any = null;
      let error: any = null;

      if (isUuid) {
        const res = await client.from('stores').select('*').eq('id', trimmed).maybeSingle();
        data = res.data;
        error = res.error;
      }

      if (!data) {
        const resName = await client.from('stores').select('*').ilike('name', trimmed).maybeSingle();
        if (resName.data) {
          data = resName.data;
          error = null;
        } else if (!error) {
          error = resName.error;
        }
      }

      if (!data) {
        const resCode = await client.from('stores').select('*').ilike('code', trimmed).maybeSingle();
        if (resCode.data) {
          data = resCode.data;
          error = null;
        }
      }

      if (error) {
        // Table not present in Supabase schema cache yet
        if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
          return null;
        }
        console.warn('[Supabase] Notice querying stores table:', error.message);
        return null;
      }

      if (!data) return null;

      const isStopped =
        data.active === false ||
        data.is_active === false ||
        data.is_blocked === true ||
        ['STOPPED', 'INACTIVE', 'BLOCKED', 'SUSPENDED', 'CLOSED', 'DISABLED'].includes(String(data.status || '').toUpperCase()) ||
        String(data.plan_status || '').toUpperCase() === 'EXPIRED' ||
        (data.plan_expires_at && new Date(data.plan_expires_at).getTime() < Date.now());

      return {
        id: data.id,
        name: data.name || trimmed,
        code: data.code || 'STORE-01',
        active: !isStopped,
        status: data.status || (isStopped ? 'STOPPED' : 'ACTIVE'),
        is_blocked: Boolean(data.is_blocked),
        plan_status: data.plan_status || (isStopped ? 'EXPIRED' : 'ACTIVE'),
        plan_expires_at: data.plan_expires_at,
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        gstin: data.gstin || '',
        currency: data.currency || 'INR',
        timezone: data.timezone || 'Asia/Kolkata',
        invoice_prefix: data.invoice_prefix || 'INV-',
        is_stopped: isStopped,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (err: any) {
      console.warn('[Supabase] Exception checking store in cloud:', err?.message || err);
      return null;
    }
  }

  static async listStoresFromCloud(): Promise<CloudStore[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    const client = supabase;

    // 1. Try querying dedicated 'stores' table
    try {
      const { data, error } = await client
        .from('stores')
        .select('*')
        .order('name', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((s: any) => {
          const isStopped =
            s.active === false ||
            s.is_active === false ||
            s.is_blocked === true ||
            ['STOPPED', 'INACTIVE', 'BLOCKED', 'SUSPENDED', 'CLOSED', 'DISABLED'].includes(String(s.status || '').toUpperCase()) ||
            String(s.plan_status || '').toUpperCase() === 'EXPIRED';

          return {
            id: s.id,
            name: s.name,
            code: s.code || 'STORE-01',
            active: !isStopped,
            status: s.status || (isStopped ? 'STOPPED' : 'ACTIVE'),
            is_blocked: Boolean(s.is_blocked),
            plan_status: s.plan_status || (isStopped ? 'EXPIRED' : 'ACTIVE'),
            plan_expires_at: s.plan_expires_at,
            address: s.address || '',
            phone: s.phone || '',
            email: s.email || '',
            gstin: s.gstin || '',
            currency: s.currency || 'INR',
            timezone: s.timezone || 'Asia/Kolkata',
            invoice_prefix: s.invoice_prefix || 'INV-',
            is_stopped: isStopped,
            created_at: s.created_at,
            updated_at: s.updated_at,
          };
        });
      }
    } catch (_) {}

    // 2. Fallback: Aggregate unique stores from 'users' table if 'stores' table is not created yet
    try {
      const { data: users, error: uErr } = await client.from('users').select('store_id, store_name, status, is_blocked, active, store_status, store_active');
      if (!uErr && Array.isArray(users)) {
        const storeMap = new Map<string, CloudStore>();
        for (const u of users) {
          const key = u.store_name || u.store_id || 'FryFreeze';
          if (!storeMap.has(key)) {
            const isStopped =
              u.store_active === false ||
              ['STOPPED', 'INACTIVE', 'BLOCKED', 'SUSPENDED'].includes(String(u.store_status || '').toUpperCase());
            storeMap.set(key, {
              id: u.store_id || key,
              name: u.store_name || (u.store_id === 'STORE-01' ? 'FryFreeze' : key),
              code: (u.store_name || key).toUpperCase().replace(/\s+/g, '-').slice(0, 10),
              active: !isStopped,
              status: isStopped ? 'STOPPED' : 'ACTIVE',
              is_stopped: isStopped,
              user_count: 1,
            });
          } else {
            const existing = storeMap.get(key)!;
            existing.user_count = (existing.user_count || 0) + 1;
          }
        }
        return Array.from(storeMap.values());
      }
    } catch (_) {}

    return [];
  }

  static async updateStoreInCloud(storeIdOrName: string, updates: Partial<CloudStore>): Promise<boolean> {
    const client = this.checkSupabase();
    const isStopped = updates.status === 'STOPPED' || updates.active === false || updates.is_blocked === true;
    const now = new Date().toISOString();

    let storeUpdated = false;

    // 1. Update in 'stores' table if it exists
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeIdOrName);
      let query = client.from('stores').update({
        active: !isStopped,
        status: isStopped ? 'STOPPED' : 'ACTIVE',
        is_blocked: Boolean(isStopped),
        plan_status: isStopped ? 'EXPIRED' : 'ACTIVE',
        updated_at: now,
      });

      if (isUuid) {
        query = query.eq('id', storeIdOrName);
      } else {
        query = query.ilike('name', storeIdOrName);
      }

      const { data, error } = await query.select();
      if (!error && data && data.length > 0) {
        storeUpdated = true;
      }
    } catch (_) {}

    // 2. Also propagate store status to associated 'users' in Supabase
    // This guarantees stopping a store blocks its users even before the stores table is populated
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeIdOrName);
      const userUpdates: Record<string, any> = {
        store_status: isStopped ? 'STOPPED' : 'ACTIVE',
        store_active: !isStopped,
        updated_at: now,
      };

      if (isUuid) {
        const res = await client.from('users').update(userUpdates).eq('store_id', storeIdOrName).select();
        if (!res.error && res.data && res.data.length > 0) storeUpdated = true;
      } else {
        const res = await client.from('users').update(userUpdates).ilike('store_name', storeIdOrName).select();
        if (!res.error && res.data && res.data.length > 0) storeUpdated = true;
      }
    } catch (_) {}

    return storeUpdated;
  }

  static async isStoreStoppedInCloud(storeIdOrName: string): Promise<boolean> {
    const store = await this.getStoreFromCloud(storeIdOrName);
    if (store) {
      return store.is_stopped;
    }
    return false;
  }

  // ============================================================
  // STORE & BUSINESS OPERATIONS (Delegated to Local SQLite Ledger)
  // ============================================================
  static getStore(storeId: string) { return LocalDb.getStore(storeId); }
  static getFirstStore() { return LocalDb.getFirstStore(); }
  static updateStore(storeId: string, updates: Partial<Store>) { return LocalDb.updateStore(storeId, updates); }
  static createSale(sale: any, items: any[]) { return LocalDb.createSale(sale, items); }
  static createStockMovementsBatch(movements: any[]) { return LocalDb.createStockMovementsBatch(movements); }
  static updateProduct(id: string, updates: any) { return LocalDb.updateProduct(id, updates); }
  static createStockMovement(movement: any) { return LocalDb.createStockMovement(movement); }
  static voidSale(saleId: string, userId: string, userName: string, reason: string) { return LocalDb.voidSale(saleId, userId, userName, reason); }
  static createExpense(exp: any) { return LocalDb.createExpense(exp); }
  static voidExpense(expId: string) { return LocalDb.voidExpense(expId); }
  static createProduct(product: any) { return LocalDb.createProduct(product); }
  static deleteProduct(productId: string) { return LocalDb.deleteProduct(productId); }
  static seedDefaultCategories(storeId: string, categories: any[]) { return LocalDb.seedDefaultCategories(storeId, categories); }
  static createCategory(payload: any) { return LocalDb.createCategory(payload); }
  static deleteCategory(storeId: string, categoryId: string) { return LocalDb.deleteCategory(storeId, categoryId); }
}

export { LocalDb };
