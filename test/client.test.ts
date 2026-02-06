import { describe, expect, it } from 'vitest';
import { defineSchema, t, ydbOrm } from '../src/index.js';

function makeAdapter() {
  const calls: any[] = [];
  return {
    calls,
    adapter: {
      async query(q: any) {
        calls.push(q);
        return [];
      },
    },
  };
}

describe('ydb-orm query builder', () => {
  const schema = defineSchema({
    user: {
      table: 'users',
      primaryKey: ['id'] as const,
      columns: {
        id: t.uint64(),
        email: t.utf8(),
        name: t.utf8().nullable(),
      },
    },
  });

  it('findMany builds SELECT with WHERE / ORDER BY / LIMIT', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.findMany({
      select: { id: true, email: true },
      where: {
        OR: [{ email: { '=': 'a@b.com' } }, { email: { '=': 'c@d.com' } }],
        id: { '>=': 1n },
      },
      orderBy: [{ id: 'DESC' }],
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('DECLARE');
    expect(calls[0].text).toContain('SELECT');
    expect(calls[0].text).toContain('FROM');
    expect(calls[0].text).toContain('WHERE');
    expect(calls[0].text).toContain('ORDER BY');
    expect(calls[0].text).toContain('LIMIT 10');
    expect(Object.keys(calls[0].params).length).toBe(3);
    expect(Object.keys(calls[0].paramTypes).length).toBe(3);
  });

  it('findFirst uses LIMIT 1', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.findFirst({ where: { id: { '=': 1n } } });

    expect(calls[0].text).toContain('LIMIT 1');
  });

  it('findUnique requires equality on primary key', async () => {
    const { adapter } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await expect(db.user.findUnique({ where: { id: { '>=': 1n } } as any })).rejects.toThrow(
      /primary key/i,
    );
  });

  it('create builds UPSERT INTO with params', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.create({
      data: { id: 1n, email: 'a@b.com', name: null },
      returning: { id: true },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('DECLARE');
    expect(calls[0].text).toContain('UPSERT INTO');
    expect(calls[0].text).toContain('RETURNING');
    expect(Object.keys(calls[0].params).length).toBe(3);
    expect(Object.keys(calls[0].paramTypes).length).toBe(3);
  });

  it('update builds UPDATE SET WHERE', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.update({
      where: { id: { '=': 1n } },
      data: { name: 'Pavel' },
      returning: { id: true, name: true },
    });

    expect(calls[0].text).toContain('DECLARE');
    expect(calls[0].text).toContain('UPDATE');
    expect(calls[0].text).toContain('SET');
    expect(calls[0].text).toContain('WHERE');
    expect(calls[0].text).toContain('RETURNING');
    expect(Object.keys(calls[0].paramTypes).length).toBeGreaterThan(0);
  });

  it('delete builds DELETE FROM WHERE', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.delete({ where: { id: { '=': 1n } } });

    expect(calls[0].text).toContain('DECLARE');
    expect(calls[0].text).toContain('DELETE FROM');
    expect(calls[0].text).toContain('WHERE');
    expect(Object.keys(calls[0].paramTypes).length).toBe(1);
  });
});
