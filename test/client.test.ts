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
    session: {
      table: 'sessions',
      primaryKey: ['userId', 'id'] as const,
      columns: {
        userId: t.uint64(),
        id: t.utf8(),
        createdAt: t.timestamp(),
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

  it('supports nested AND/OR/NOT', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.findMany({
      where: {
        AND: [
          { id: { '>=': 1n } },
          {
            OR: [{ email: { LIKE: '%@b.com' } }, { NOT: { email: { '=': 'evil@b.com' } } }],
          },
        ],
      },
      take: 5,
    });

    expect(calls[0].text).toContain('WHERE');
    expect(calls[0].text).toContain('AND');
    expect(calls[0].text).toContain('OR');
    expect(calls[0].text).toContain('NOT');
    expect(Object.keys(calls[0].paramTypes).length).toBe(3);
  });

  it('IN generates a list param and declares it', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.findMany({ where: { id: { IN: [1n, 2n, 3n] } } });

    const declLines = String(calls[0].text)
      .split('\n')
      .filter((l: string) => l.startsWith('DECLARE'))
      .join('\n');
    expect(declLines).toMatch(/List</);
  });

  it('skip/take aliases map to OFFSET/LIMIT', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.findMany({ take: 7, skip: 2 });

    expect(calls[0].text).toContain('LIMIT 7');
    expect(calls[0].text).toContain('OFFSET 2');
  });

  it('findFirst uses LIMIT 1 by default', async () => {
    const { adapter, calls } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await db.user.findFirst({ where: { id: { '=': 1n } } });

    expect(calls[0].text).toContain('LIMIT 1');
  });

  it('findUnique requires equality on single-column primary key', async () => {
    const { adapter } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await expect(db.user.findUnique({ where: { id: { '>=': 1n } } as any })).rejects.toThrow(/primary key/i);
  });

  it('findUnique requires equality for ALL columns in composite primary key', async () => {
    const { adapter } = makeAdapter();
    const db = ydbOrm({ schema, adapter });

    await expect(
      db.session.findUnique({ where: { userId: { '=': 1n } } as any }),
    ).rejects.toThrow(/primary key/i);

    await expect(
      db.session.findUnique({ where: { userId: { '=': 1n }, id: { '=': 's1' } } as any }),
    ).resolves.not.toThrow();
  });

  it('count builds SELECT COUNT(*) with optional WHERE and returns bigint', async () => {
    const { adapter, calls } = makeAdapter();
    (adapter as any).query = async (q: any) => {
      calls.push(q);
      return [{ __ydb_orm_count: 3n }];
    };
    const db = ydbOrm({ schema, adapter });

    const res = await db.user.count({ where: { email: { LIKE: '%@b.com' } } });

    expect(res).toBe(3n);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('SELECT COUNT(*) AS __ydb_orm_count');
    expect(calls[0].text).toContain('FROM');
    expect(calls[0].text).toContain('WHERE');
    expect(Object.keys(calls[0].paramTypes).length).toBe(1);
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

  it('updateMany returns count and uses RETURNING 1', async () => {
    const { adapter, calls } = makeAdapter();
    // make adapter return 3 rows
    (adapter as any).query = async (q: any) => {
      calls.push(q);
      return [{ __ydb_orm_one: 1 }, { __ydb_orm_one: 1 }, { __ydb_orm_one: 1 }];
    };

    const db = ydbOrm({ schema, adapter });

    const res = await db.user.updateMany({ where: { id: { '>=': 1n } }, data: { name: 'X' } });

    expect(res.count).toBe(3);
    expect(calls[0].text).toContain('UPDATE');
    expect(calls[0].text).toContain('RETURNING 1 AS __ydb_orm_one');
  });

  it('deleteMany returns count and uses RETURNING 1', async () => {
    const { adapter, calls } = makeAdapter();
    (adapter as any).query = async (q: any) => {
      calls.push(q);
      return [{ __ydb_orm_one: 1 }, { __ydb_orm_one: 1 }];
    };

    const db = ydbOrm({ schema, adapter });

    const res = await db.user.deleteMany({ where: { id: { '>=': 1n } } });

    expect(res.count).toBe(2);
    expect(calls[0].text).toContain('DELETE FROM');
    expect(calls[0].text).toContain('RETURNING 1 AS __ydb_orm_one');
  });

  it('upsert uses update then create (inside transaction when supported)', async () => {
    const calls: string[] = [];
    const queries: any[] = [];

    let step = 0;
    const adapter: any = {
      async begin() {
        calls.push('begin');
      },
      async commit() {
        calls.push('commit');
      },
      async rollback() {
        calls.push('rollback');
      },
      async query(q: any) {
        queries.push(q);
        calls.push('query');
        step += 1;
        // 1) UPDATE returns empty -> not found
        if (step === 1) return [];
        // 2) UPSERT returns one row
        return [{ id: 1n }];
      },
    };

    const db = ydbOrm({ schema, adapter });

    const res = await db.user.upsert({
      where: { id: { '=': 1n } },
      update: { name: 'X' },
      create: { email: 'a@b.com', name: 'X' },
      returning: { id: true },
    });

    expect(res).toEqual({ id: 1n });
    expect(calls).toEqual(['begin', 'query', 'query', 'commit']);
    expect(queries[0].text).toContain('UPDATE');
    expect(queries[1].text).toContain('UPSERT INTO');
  });
});
