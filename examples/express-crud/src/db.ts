import { createRequire } from 'node:module';
import { defineSchema, t, ydbOrm, ydbSdkAdapter } from '@pbelyaev/ydb-orm';

const require = createRequire(import.meta.url);
const { Driver, TableSessionPool, AnonymousAuthService, Types } = require('ydb-sdk');

export const endpoint = process.env.YDB_ENDPOINT ?? 'grpc://localhost:2136';
export const database = process.env.YDB_DATABASE ?? '/local';

export const schema = defineSchema({
  user: {
    table: 'users',
    primaryKey: ['id'] as const,
    columns: {
      id: t.utf8(),
      email: t.utf8(),
      name: t.utf8().nullable(),
    },
  },
  post: {
    table: 'posts',
    primaryKey: ['id'] as const,
    columns: {
      id: t.utf8(),
      userId: t.utf8(),
      title: t.utf8(),
      body: t.utf8().nullable(),
      createdAt: t.timestamp(),
    },
  },
});

export async function createDb() {
  const driver = new Driver({ endpoint, database, authService: new AnonymousAuthService() });
  await driver.ready(10_000);
  const pool = new TableSessionPool(driver.clientSettings);
  const adapter = ydbSdkAdapter({ pool, idempotent: true });
  const db = ydbOrm({ schema, adapter });

  return { driver, pool, db, Types };
}

export async function ensureSchema(pool: any, Types: any) {
  await pool.withSessionRetry(
    async (session: any) => {
      // recreate for demo simplicity
      try {
        await session.dropTable('posts');
      } catch {}
      try {
        await session.dropTable('users');
      } catch {}

      await session.createTable('users', {
        columns: [
          { name: 'id', type: Types.UTF8 },
          { name: 'email', type: Types.UTF8 },
          { name: 'name', type: Types.optional(Types.UTF8) },
        ],
        primaryKey: ['id'],
      });

      await session.createTable('posts', {
        columns: [
          { name: 'id', type: Types.UTF8 },
          { name: 'userId', type: Types.UTF8 },
          { name: 'title', type: Types.UTF8 },
          { name: 'body', type: Types.optional(Types.UTF8) },
          { name: 'createdAt', type: Types.TIMESTAMP },
        ],
        primaryKey: ['id'],
      });
    },
    undefined,
    10,
  );
}
