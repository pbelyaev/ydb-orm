import { describe, expect, it } from 'vitest';

import { defineSchema, t } from '../src/schema.js';

describe('defineSchema runtime validation', () => {
  it('throws when primaryKey is empty', () => {
    expect(() =>
      defineSchema({
        user: {
          table: 'user',
          columns: { id: t.utf8() },
          // @ts-expect-error test: invalid schema
          primaryKey: [],
        },
      }),
    ).toThrow(/primaryKey must be a non-empty array/);
  });

  it('throws when primaryKey references a missing column', () => {
    expect(() =>
      defineSchema({
        user: {
          table: 'user',
          columns: { id: t.utf8() },
          // @ts-expect-error test: invalid schema
          primaryKey: ['missing'],
        },
      }),
    ).toThrow(/references missing column "missing"/);
  });
});
