import { describe, expect, it } from 'vitest';
import { defineSchema, t } from '../src/schema.js';
import { ydbOrm } from '../src/client.js';

function mockAdapter() {
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

describe('where extra ops', () => {
  it('supports isNull/isNotNull/between/contains', async () => {
    const { adapter, calls } = mockAdapter();
    const schema = defineSchema({
      user: {
        table: 'users',
        primaryKey: ['id'] as const,
        columns: { id: t.uint64(), email: t.utf8(), name: t.utf8().nullable() },
      },
    });

    const db = ydbOrm({ schema, adapter: adapter as any });

    await db.user.findMany({
      where: {
        name: { isNull: true },
        email: { contains: '@b' },
        id: { between: [1n, 10n] },
      },
    });

    expect(calls).toHaveLength(1);
    const q = calls[0];
    expect(q.text).toContain('`name` IS NULL');
    expect(q.text).toContain('`email` LIKE $');
    expect(q.text).toContain('`id` BETWEEN $');
  });

  it('turns IN [] into FALSE (matches nothing)', async () => {
    const { adapter, calls } = mockAdapter();
    const schema = defineSchema({
      user: {
        table: 'users',
        primaryKey: ['id'] as const,
        columns: { id: t.uint64(), email: t.utf8() },
      },
    });

    const db = ydbOrm({ schema, adapter: adapter as any });

    await db.user.findMany({
      where: {
        id: { IN: [] },
      },
    });

    const q = calls[0];
    expect(q.text).toContain('WHERE FALSE');
  });
});
