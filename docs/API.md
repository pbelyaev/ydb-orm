# API (WIP)

This library is intentionally small and explicit. It generates **YQL with native tokens** and also generates **typed `DECLARE` parameters** suitable for the official `ydb-sdk`.

## Schema

```ts
import { defineSchema, t } from '@pbelyaev/ydb-orm';

const schema = defineSchema({
  user: {
    table: 'users',
    primaryKey: ['id'],
    columns: {
      id: t.uint64(),
      email: t.utf8(),
      name: t.utf8().nullable(),
      createdAt: t.timestamp(),
    },
  },
});
```

### Types (`t.*`)

- `t.bool()` -> `Bool`
- `t.int32()` -> `Int32`
- `t.int64()` -> `Int64`
- `t.uint32()` -> `Uint32`
- `t.uint64()` -> `Uint64`
- `t.utf8()` -> `Utf8`
- `t.string()` -> `String`
- `t.timestamp()` -> `Timestamp`
- `t.json<T>()` -> `Json`
- `t.jsonDocument<T>()` -> `JsonDocument`
- `t.yson<T>()` -> `Yson`
- `t.bytes()` -> `Bytes`

Add `.nullable()` to make it `Optional<...>`.

## Client

```ts
import { ydbOrm } from '@pbelyaev/ydb-orm';

const db = ydbOrm({ schema, adapter });

await db.user.findMany({ where: { email: { '=': 'a@b.com' } } });
```

### `findMany`

```ts
db.user.findMany({
  where: {
    AND: [
      { id: { '>=': 1n } },
      { OR: [{ email: { LIKE: '%@b.com' } }, { NOT: { email: { '=': 'evil@b.com' } } }] },
    ],
  },
  select: { id: true, email: true },
  orderBy: [{ id: 'DESC' }],
  take: 10, // alias for limit
  skip: 0,  // alias for offset
});
```

- `where` supports column operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `IN`, `LIKE`
- extra `where` operators:
  - string sugar: `startsWith`, `endsWith`, `contains` (compiled into `LIKE`)
  - null checks: `isNull`, `isNotNull`
  - ranges: `between: [a, b]`
  - `IN: []` is compiled into `FALSE` (matches nothing)
- logical operators: `AND`, `OR`, `NOT`
- pagination:
  - `limit`/`offset` (SQL-like)
  - `take`/`skip` (Prisma-like aliases)

### `findFirst`

Like `findMany`, but returns the first row (by default adds `LIMIT 1`).

### `findUnique`

```ts
await db.user.findUnique({
  where: { id: { '=': 1n } },
});
```

- Requires equality (`=`) for **all primary key columns**.

### `create`

Uses YQL `UPSERT INTO ... VALUES ...`.

### `upsert`

Prisma-like upsert by primary key.

- Requires equality (`=`) for **all primary key columns** in `where`.
- Runs as: `UPDATE ... RETURNING ...` and if no rows returned, then `UPSERT ... RETURNING ...`.
- If adapter supports explicit transactions, it will be run inside a transaction.

### `update`

Uses YQL `UPDATE ... SET ... WHERE ...`.

### `updateMany`

Updates many rows.

Returns `{ count }` (number of affected rows). Implemented via `RETURNING 1`.

### `delete`

Uses YQL `DELETE FROM ... WHERE ...`.

### `deleteMany`

Deletes many rows.

Returns `{ count }` (number of affected rows). Implemented via `RETURNING 1`.

## Adapter

### `ydbSdkAdapter`

Notes:
- Supports explicit transactions via `$transaction(...)`.
- Nested `$transaction(...)` calls will reuse the outer transaction (no double begin/commit), when the adapter supports `inTransaction()`.

```ts
import { ydbSdkAdapter } from '@pbelyaev/ydb-orm';
import { Driver, TableSessionPool, getCredentialsFromEnv } from 'ydb-sdk';

const driver = new Driver({ endpoint, database, authService: getCredentialsFromEnv() });
await driver.ready(10_000);

const pool = new TableSessionPool({
  database,
  authService: driver.authService,
  sslCredentials: driver.sslCredentials,
  clientOptions: driver.clientOptions,
});

const adapter = ydbSdkAdapter({ pool, idempotent: true });
```

The ORM will pass to the adapter:

- `text`: full YQL with `DECLARE` section
- `params`: native JS values
- `paramTypes`: YDB `IType` map (so binding can use `TypedValues.fromNative(type, value)`)
