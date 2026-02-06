import type { Adapter, QueryRequest } from '../client.js';
import { TableSessionPool, TypedValues, TypedData, ExecuteQuerySettings, AUTO_TX } from 'ydb-sdk';

export type YdbSdkAdapterOptions = {
  pool: TableSessionPool;
  /** If true, use idempotent execute settings where possible. */
  idempotent?: boolean;
};

function bindParams(q: QueryRequest): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [name, value] of Object.entries(q.params)) {
    const t = q.paramTypes[name];
    if (!t) throw new Error(`Missing param type for $${name}`);
    out[name] = TypedValues.fromNative(t, value);
  }
  return out;
}

export function ydbSdkAdapter(opts: YdbSdkAdapterOptions): Adapter {
  return {
    async query(q) {
      const settings = new ExecuteQuerySettings();
      if (opts.idempotent) settings.withIdempotent(true);

      const params = bindParams(q);
      const res: any = await opts.pool.withSessionRetry(
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
      return typed.map((t) => ({ ...t }));
    },
  };
}
