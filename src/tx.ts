import type { Adapter } from './client.js';

export type TransactionAdapter = Adapter & {
  /** Optional hook for adapters that support explicit transactions (YDB). */
  begin?: () => Promise<void>;
  commit?: () => Promise<void>;
  rollback?: () => Promise<void>;
};

export async function runInTransaction<T>(adapter: TransactionAdapter, fn: (tx: Adapter) => Promise<T>): Promise<T> {
  if (!adapter.begin || !adapter.commit || !adapter.rollback) {
    // Fallback: run without explicit transaction
    return fn(adapter);
  }

  await adapter.begin();
  try {
    const res = await fn(adapter);
    await adapter.commit();
    return res;
  } catch (e) {
    try {
      await adapter.rollback();
    } catch {
      // ignore rollback errors
    }
    throw e;
  }
}
