import { LocalDb } from './localDb.ts';
import { supabase, isSupabaseConfigured } from './supabaseClient.ts';
import type { User, Store } from './db.ts';

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

  static async getUserByEmail(emailOrUsername: string): Promise<(User & { is_blocked?: boolean; status?: string }) | null> {
    const client = this.checkSupabase();
    const clean = emailOrUsername.trim().toLowerCase();

    let queryResult: any;
    try {
      queryResult = await client
        .from('users')
        .select('*')
        .or(`email.ilike.${clean},name.ilike.${clean}`)
        .maybeSingle();
    } catch (networkErr: any) {
      console.warn('[Supabase] Offline network error:', networkErr?.message || networkErr);
      throw new Error('No internet connection. Please connect to the internet to log in to your store account, or use Developer offline mode.');
    }

    const { data, error } = queryResult;

    if (error) {
      throw new Error(`Supabase User Query Error: ${error.message}`);
    }

    if (!data) return null;

    const isBlocked =
      data.is_blocked === true ||
      data.active === false ||
      data.status === 'BLOCKED' ||
      data.status === 'INACTIVE';

    return {
      id: data.id,
      store_id: data.store_id || 'a0000000-0000-0000-0000-000000000001',
      name: data.name || data.email,
      email: data.email,
      password_hash: data.password_hash || data.password || '',
      salt: data.salt || '',
      role: (['ADMIN', 'DEVELOPER'].includes(data.role?.toUpperCase()) ? data.role.toUpperCase() : 'EMPLOYEE') as 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER',
      active: !isBlocked,
      is_blocked: isBlocked,
      status: data.status,
      last_login_at: data.last_login_at,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || data.created_at || new Date().toISOString(),
    };
  }

  static async getUserById(id: string): Promise<User | null> {
    const client = this.checkSupabase();
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;

    const isBlocked =
      data.is_blocked === true ||
      data.active === false ||
      data.status === 'BLOCKED' ||
      data.status === 'INACTIVE';

    return {
      id: data.id,
      store_id: data.store_id || 'a0000000-0000-0000-0000-000000000001',
      name: data.name || data.email,
      email: data.email,
      password_hash: data.password_hash || data.password || '',
      salt: data.salt || '',
      role: (['ADMIN', 'DEVELOPER'].includes(data.role?.toUpperCase()) ? data.role.toUpperCase() : 'EMPLOYEE') as 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER',
      active: !isBlocked,
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

  static async createUser(user: User): Promise<User> {
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

    const { data, error } = await client
      .from('users')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create employee in Supabase: ${error.message}`);
    }

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
