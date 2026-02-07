import { describe, expect, it } from 'vitest';
import { runInTransaction } from '../src/tx.js';

function mkTxAdapter() {
  const calls: string[] = [];
  return {
    calls,
    adapter: {
      async query() {
        calls.push('query');
        return [];
      },
      async begin() {
        calls.push('begin');
      },
      async commit() {
        calls.push('commit');
      },
      async rollback() {
        calls.push('rollback');
      },
    },
  };
}

describe('transactions', () => {
  it('commits on success', async () => {
    const { adapter, calls } = mkTxAdapter();
    await runInTransaction(adapter as any, async (tx) => {
      await tx.query({ text: 'x', params: {}, paramTypes: {} });
      return 123;
    });
    expect(calls).toEqual(['begin', 'query', 'commit']);
  });

  it('rolls back on error', async () => {
    const { adapter, calls } = mkTxAdapter();
    await expect(
      runInTransaction(adapter as any, async (tx) => {
        await tx.query({ text: 'x', params: {}, paramTypes: {} });
        throw new Error('boom');
      }),
    ).rejects.toThrow(/boom/);

    expect(calls).toEqual(['begin', 'query', 'rollback']);
  });

  it('supports nested transactions when adapter exposes inTransaction()', async () => {
    const calls: string[] = [];
    let inTx = false;
    const adapter: any = {
      async query() {
        calls.push('query');
        return [];
      },
      inTransaction() {
        return inTx;
      },
      async begin() {
        calls.push('begin');
        inTx = true;
      },
      async commit() {
        calls.push('commit');
        inTx = false;
      },
      async rollback() {
        calls.push('rollback');
        inTx = false;
      },
    };

    await runInTransaction(adapter, async () => {
      await runInTransaction(adapter, async (tx) => {
        await tx.query({ text: 'x', params: {}, paramTypes: {} });
      });
    });

    expect(calls).toEqual(['begin', 'query', 'commit']);
  });
});
