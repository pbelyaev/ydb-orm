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

describe('createMany', () => {
  it('generates AS_TABLE rows query', async () => {
    const { adapter, calls } = mockAdapter();
    const schema = defineSchema({
      user: {
        table: 'users',
        primaryKey: ['id'] as const,
        columns: { id: t.uint64(), email: t.utf8(), name: t.utf8().nullable() },
      },
    });

    const db = ydbOrm({ schema, adapter: adapter as any });
    const res = await db.user.createMany({
      data: [
        { id: 1n, email: 'a@b.com', name: 'Pavel' },
        { id: 2n, email: 'c@d.com', name: null },
      ],
    });

    expect(res).toEqual({ count: 2 });
    expect(calls).toHaveLength(1);
    expect(String(calls[0].text)).toContain('AS_TABLE($rows)');
    expect(calls[0].params.rows).toHaveLength(2);
  });
});
