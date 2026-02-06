# @pbelyaev/ydb-orm

Prisma-like ORM-ish client for **YDB (YQL / table API)**.

> Status: early WIP (MVP).

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

// Official YDB SDK adapter
// (you create the TableSessionPool; ORM generates DECLARE + binds typed params)
//
// import { Driver, TableSessionPool, getCredentialsFromEnv } from 'ydb-sdk';
// const driver = new Driver({ endpoint, database, authService: getCredentialsFromEnv() });
// await driver.ready(10000);
// const pool = new TableSessionPool({ database, authService: driver.authService, sslCredentials: driver.sslCredentials, clientOptions: driver.clientOptions });
//
// const adapter = ydbSdkAdapter({ pool });

const db = ydbOrm({ schema, adapter });

await db.user.create({ data: { id: 1n, email: 'a@b.com', name: 'Pavel' } });

const users = await db.user.findMany({
  where: { email: { '=': 'a@b.com' } },
  select: { id: true, email: true },
  limit: 10,
});
```

## Development

```bash
npm test
npm run build
```
