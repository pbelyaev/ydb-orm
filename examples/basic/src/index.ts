import { Driver, TableSessionPool, getCredentialsFromEnv, TypedData, declareType, Types } from 'ydb-sdk';
import { defineSchema, t, ydbOrm, ydbSdkAdapter } from '@pbelyaev/ydb-orm';

const endpoint = process.env.YDB_ENDPOINT ?? 'grpc://localhost:2136';
const database = process.env.YDB_DATABASE ?? '/local';

class UserRow extends TypedData {
  @declareType(Types.UINT64)
  id!: any;

  @declareType(Types.UTF8)
  email!: string;

  @declareType(Types.optional(Types.UTF8))
  name!: string | null;
}

async function main() {
  const driver = new Driver({
    endpoint,
    database,
    authService: getCredentialsFromEnv(),
  });
  await driver.ready(10_000);

  const pool = new TableSessionPool({
    database,
    authService: driver.authService,
    sslCredentials: driver.sslCredentials,
    clientOptions: driver.clientOptions,
  });

  const adapter = ydbSdkAdapter({ pool, idempotent: true });

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

  const db = ydbOrm({ schema, adapter });

  // Create table (idempotent-ish)
  await pool.withSessionRetry(
    async (session) => {
      try {
        await session.dropTable('users');
      } catch {
        // ignore
      }
      await session.createTable(
        'users',
        {
          columns: [
            { name: 'id', type: Types.UINT64 },
            { name: 'email', type: Types.UTF8 },
            { name: 'name', type: Types.optional(Types.UTF8) },
          ],
          primaryKey: ['id'],
        } as any,
      );
    },
    undefined,
    10,
  );

  await db.user.create({ data: { id: 1n, email: 'a@b.com', name: 'Pavel' } });
  await db.user.create({ data: { id: 2n, email: 'c@d.com', name: null } });

  const rows = await db.user.findMany({
    where: { OR: [{ email: { LIKE: '%@b.com' } }, { id: { IN: [2n] } }] },
    orderBy: [{ id: 'DESC' }],
    select: { id: true, email: true, name: true },
    take: 10,
  });

  console.log('rows:', rows);

  // Clean up
  await pool.destroy();
  await driver.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
