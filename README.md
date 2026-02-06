# @pbelyaev/ydb-orm

Prisma-like ORM-ish client for **YDB (YQL / table API)**.

- Generates YQL with native tokens (SELECT/WHERE/UPSERT/RETURNING, ...)
- Generates typed `DECLARE` parameters for the official `ydb-sdk`
- Prisma-ish API without codegen

> Status: MVP, API may change.

## Docs

- API: [`docs/API.md`](docs/API.md)

## Goals

- Prisma-ish API (`db.user.findMany(...)`, `create`, `update`, `delete`)
- Keep **native YQL tokens** (e.g. `SELECT`, `FROM`, `WHERE`, `UPSERT`, `RETURNING`), but provide a convenient TS API
- Strong typing via model definitions (no codegen in MVP)
- Testable core: query building + parameter binding + result mapping

## Non-goals (for now)

- Migrations
- Relations

## Install

```bash
npm i @pbelyaev/ydb-orm
```

## Quick example

```ts
import { defineSchema, ydbOrm, ydbSdkAdapter, t } from '@pbelyaev/ydb-orm';
import { Driver, TableSessionPool, getCredentialsFromEnv } from 'ydb-sdk';

const endpoint = process.env.YDB_ENDPOINT!;
const database = process.env.YDB_DATABASE!;

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
    primaryKey: ['id'],
    columns: {
      id: t.uint64(),
      email: t.utf8(),
      name: t.utf8().nullable(),
    },
  },
});

const db = ydbOrm({ schema, adapter });

await db.user.create({ data: { id: 1n, email: 'a@b.com', name: 'Pavel' } });

const users = await db.user.findMany({
  where: {
    OR: [{ email: { '=': 'a@b.com' } }, { email: { '=': 'c@d.com' } }],
  },
  select: { id: true, email: true },
  orderBy: [{ id: 'DESC' }],
  take: 10,
  skip: 0,
});
```

## Development

```bash
npm test
npm run build
```
