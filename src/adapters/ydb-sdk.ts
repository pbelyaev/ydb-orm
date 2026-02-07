import type { Adapter, QueryRequest } from '../client.js';
import type { Ydb, TableSessionPool } from 'ydb-sdk';
import { require } from '../require.js';

const ydb: any = require('ydb-sdk');
const { TypedValues, TypedData, ExecuteQuerySettings, AUTO_TX } = ydb;

type TxState = {
  session: any;
  txId: string;
};

export type YdbSdkAdapterOptions = {
  pool: TableSessionPool;
  /** If true, use idempotent execute settings where possible. */
  idempotent?: boolean;
};

function normalizeNative(t: Ydb.IType, value: any): any {
  // ydb-sdk does not accept bigint for int64/uint64; it expects number or Long.
  const Long = require('long');

  if ((t as any).optionalType?.item) {
    if (value === null || value === undefined) return null;
    return normalizeNative((t as any).optionalType.item, value);
  }

  if ((t as any).listType?.item) {
    const itemType = (t as any).listType.item as Ydb.IType;
    if (!Array.isArray(value)) return value;
    return value.map((v) => normalizeNative(itemType, v));
  }

  if ((t as any).structType?.members) {
    const members = (t as any).structType.members as Array<{ name: string; type: Ydb.IType }>;
    if (value === null || value === undefined) return value;
    const out: any = {};
    for (const m of members) {
      out[m.name] = normalizeNative(m.type, (value as any)[m.name]);
    }
    return out;
  }

  const typeId = (t as any).typeId;
  if (typeId === 3 /* INT64 */ && typeof value === 'bigint') {
    return Long.fromString(value.toString(), false);
  }
  if (typeId === 4 /* UINT64 */ && typeof value === 'bigint') {
    return Long.fromString(value.toString(), true);
  }

  return value;
}

function bindParams(q: QueryRequest): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [name, value] of Object.entries(q.params)) {
    const t = q.paramTypes[name];
    if (!t) throw new Error(`Missing param type for $${name}`);
    // ydb-sdk expects keys with leading '$' (matching DECLARE $x ...)
    out[`$${name}`] = TypedValues.fromNative(t, normalizeNative(t, value));
  }
  return out;
}

export function ydbSdkAdapter(opts: YdbSdkAdapterOptions): Adapter & {
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  inTransaction: () => boolean;
} {
  let tx: TxState | null = null;
  let txDepth = 0;

  async function ensureInTx() {
    if (!tx || txDepth <= 0) throw new Error('Not in transaction');
  }

  return {
    inTransaction() {
      return !!tx && txDepth > 0;
    },

    async begin() {
      // Support nesting: a nested begin() is a no-op.
      if (tx) {
        txDepth += 1;
        return;
      }

      // NOTE: ydb-sdk types mark acquire() as private, but it's available at runtime.
      const session = await (opts.pool as any).acquire(10_000);
      try {
        const txMeta = await session.beginTransaction({ serializableReadWrite: {} });
        tx = { session, txId: txMeta.id };
        txDepth = 1;
      } catch (e) {
        session.release();
        throw e;
      }
    },

    async commit() {
      await ensureInTx();
      if (txDepth > 1) {
        txDepth -= 1;
        return;
      }

      const { session, txId } = tx!;
      tx = null;
      txDepth = 0;
      try {
        await session.commitTransaction({ txId });
      } finally {
        session.release();
      }
    },

    async rollback() {
      await ensureInTx();
      // Any rollback aborts the whole transaction.
      const { session, txId } = tx!;
      tx = null;
      txDepth = 0;
      try {
        await session.rollbackTransaction({ txId });
      } finally {
        session.release();
      }
    },

    async query(q) {
      const settings = new ExecuteQuerySettings();
      // NOTE: do not force idempotent inside explicit transactions
      if (opts.idempotent && !tx) settings.withIdempotent(true);

      const params = bindParams(q);

      const res: any = tx
        ? await tx.session.executeQuery(q.text, params, { txId: tx.txId, commitTx: false }, settings)
        : await opts.pool.withSessionRetry(
            async (session) => {
              return session.executeQuery(q.text, params, AUTO_TX, settings);
            },
            undefined,
            10,
          );

      const rs = (res.resultSets ?? [])[0];
      if (!rs) return [];

      // Convert to plain JS objects
      const typed = TypedData.createNativeObjects(rs);
      return typed.map((t: any) => ({ ...t }));
    },
  };
}
