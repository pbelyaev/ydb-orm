import type { Adapter } from './client.js';

export type TransactionAdapter = Adapter & {
  /** Optional hook for adapters that support explicit transactions (YDB). */
  begin?: () => Promise<void>;
  commit?: () => Promise<void>;
  rollback?: () => Promise<void>;

  /**
   * Optional hook to detect whether the adapter is already inside an explicit transaction.
   * If true, runInTransaction will NOT attempt to begin/commit/rollback again.
   */
  inTransaction?: () => boolean;
};

export async function runInTransaction<T>(adapter: TransactionAdapter, fn: (tx: Adapter) => Promise<T>): Promise<T> {
  if (!adapter.begin || !adapter.commit || !adapter.rollback) {
    // Fallback: run without explicit transaction
    return fn(adapter);
  }

  // Support nesting: if we're already in a transaction, just reuse it.
  if (adapter.inTransaction?.()) {
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
