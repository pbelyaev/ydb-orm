import type { ModelDef, SchemaDef, InferModel, ColumnDef } from './schema.js';
import { columnYdbType } from './schema.js';
import type { DeepPartial, Simplify } from './types.js';
import { ident, param } from './yql.js';
import { ydbTypeToYqlString } from './ydb-types.js';

import type { Ydb } from 'ydb-sdk';

export type QueryRequest = {
  /** Full YQL text (including DECLARE statements if any). */
  text: string;
  /** Native JS values; adapter is responsible for binding them. */
  params: Record<string, any>;
  /** Param types for binding (YDB SDK IType). */
  paramTypes: Record<string, Ydb.IType>;
};

export type Adapter = {
  query: (q: QueryRequest) => Promise<Array<Record<string, any>>>;
};

export type WhereOps<T> = T extends (infer U) | null
  ? {
      '='?: U | null;
      '!='?: U | null;
      '>'?: U;
      '>='?: U;
      '<'?: U;
      '<='?: U;
      IN?: U[];
      LIKE?: U extends string ? string : never;
      // sugar
      startsWith?: U extends string ? string : never;
      endsWith?: U extends string ? string : never;
      contains?: U extends string ? string : never;
      // null checks
      isNull?: boolean;
      isNotNull?: boolean;
      // ranges
      between?: [U, U];
    }
  : {
      '='?: T;
      '!='?: T;
      '>'?: T;
      '>='?: T;
      '<'?: T;
      '<='?: T;
      IN?: T[];
      LIKE?: T extends string ? string : never;
      // sugar
      startsWith?: T extends string ? string : never;
      endsWith?: T extends string ? string : never;
      contains?: T extends string ? string : never;
      // null checks
      isNull?: boolean;
      isNotNull?: boolean;
      // ranges
      between?: [T, T];
    };

export type WhereFields<M> = {
  [K in keyof M]?: WhereOps<M[K]>;
};

export type Where<M> = WhereFields<M> & {
  AND?: Array<Where<M>>;
  OR?: Array<Where<M>>;
  NOT?: Where<M>;
};

export type Select<M> = {
  [K in keyof M]?: boolean;
};

type SelectedKeys<M, Sel> = Sel extends Select<M>
  ? { [K in keyof M]: Sel[K] extends true ? K : never }[keyof M]
  : keyof M;

type SelectResult<M, Sel> = Sel extends Select<M> ? Simplify<Pick<M, SelectedKeys<M, Sel>>> : M;

export type OrderDirection = 'ASC' | 'DESC';
export type OrderBy<M> =
  | { [K in keyof M]?: OrderDirection }
  | Array<{ [K in keyof M]?: OrderDirection }>;

export type FindManyArgs<M> = {
  where?: Where<M>;
  select?: Select<M>;
  orderBy?: OrderBy<M>;

  /** SQL-like */
  limit?: number;
  /** SQL-like */
  offset?: number;

  /** Prisma-like alias for offset */
  skip?: number;
  /** Prisma-like alias for limit */
  take?: number;
};

export type FindFirstArgs<M> = Omit<FindManyArgs<M>, 'limit'> & { limit?: number };

export type FindUniqueArgs<M> = {
  where: WhereFields<M>;
  select?: Select<M>;
};

export type CreateArgs<M> = {
  data: DeepPartial<M>;
  returning?: Select<M>;
};

export type UpsertArgs<M> = {
  /** Unique selector: requires equality for all primary key columns. */
  where: WhereFields<M>;
  create: DeepPartial<M>;
  update: DeepPartial<M>;
  returning?: Select<M>;
};

export type CreateManyArgs<M> = {
  data: Array<DeepPartial<M>>;
};

export type UpdateArgs<M> = {
  where: Where<M>;
  data: DeepPartial<M>;
  returning?: Select<M>;
};

export type UpdateManyArgs<M> = {
  where?: Where<M>;
  data: DeepPartial<M>;
};

export type DeleteArgs<M> = {
  where: Where<M>;
  returning?: Select<M>;
};

export type DeleteManyArgs<M> = {
  where?: Where<M>;
};

function buildSelect<M>(cols: (keyof M & string)[], select?: Select<M>): string {
  const list = (select ? cols.filter((c) => (select as any)[c]) : cols).map(ident);
  return list.length ? list.join(', ') : '*';
}

function parensIfNeeded(expr: string): string {
  const t = expr.trim();
  if (!t) return t;
  if (t.startsWith('(') && t.endsWith(')')) return t;
  return `(${t})`;
}

type Counter = { i: number };

function buildWhereExpr<M>(
  where: Where<M> | undefined,
  pfx: string,
  columns: Record<string, ColumnDef<any>>,
  params: Record<string, any>,
  paramTypes: Record<string, Ydb.IType>,
  c: Counter,
): string {
  if (!where) return '';

  const parts: string[] = [];

  // Column predicates
  for (const [key, ops] of Object.entries(where as any)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') continue;
    if (!ops) continue;

    const colDef = columns[key];
    if (!colDef) throw new Error(`Unknown column in where: ${key}`);

    for (const [op, value] of Object.entries(ops as any)) {
      if (op === 'isNull') {
        if (value) parts.push(`${ident(key)} IS NULL`);
        continue;
      }
      if (op === 'isNotNull') {
        if (value) parts.push(`${ident(key)} IS NOT NULL`);
        continue;
      }

      if (op === 'between') {
        const [a, b] = value as any;
        const nameA = `${pfx}_${key}_${c.i++}`;
        const nameB = `${pfx}_${key}_${c.i++}`;
        const ydbType = columnYdbType(colDef);
        paramTypes[nameA] = ydbType;
        params[nameA] = a;
        paramTypes[nameB] = ydbType;
        params[nameB] = b;
        parts.push(`${ident(key)} BETWEEN ${param(nameA)} AND ${param(nameB)}`);
        continue;
      }

      if (op === 'startsWith' || op === 'endsWith' || op === 'contains') {
        const s = String(value ?? '');
        const like = op === 'startsWith' ? `${s}%` : op === 'endsWith' ? `%${s}` : `%${s}%`;
        const name = `${pfx}_${key}_${c.i++}`;
        const ydbType = columnYdbType(colDef);
        paramTypes[name] = ydbType;
        params[name] = like;
        parts.push(`${ident(key)} LIKE ${param(name)}`);
        continue;
      }

      const name = `${pfx}_${key}_${c.i++}`;

      let ydbType: Ydb.IType = columnYdbType(colDef);
      if (op === 'IN') {
        ydbType = { listType: { item: ydbType } };
      } else if (value === null) {
        // If column already Optional<...>, keep it.
        if (!(colDef as any).isNullable) ydbType = { optionalType: { item: ydbType } };
      }
      paramTypes[name] = ydbType;
      params[name] = value;

      if (op === 'IN') {
        // Edge case: empty IN list should match nothing.
        if (Array.isArray(value) && value.length === 0) {
          // Avoid generating invalid "IN ()" and avoid binding an unused param.
          delete params[name];
          delete paramTypes[name];
          parts.push('FALSE');
        } else {
          parts.push(`${ident(key)} IN ${param(name)}`);
        }
      } else if (op === 'LIKE') {
        parts.push(`${ident(key)} LIKE ${param(name)}`);
      } else {
        parts.push(`${ident(key)} ${op} ${param(name)}`);
      }
    }
  }

  // AND
  if (Array.isArray((where as any).AND) && (where as any).AND.length) {
    const inner = (where as any).AND.map((w: any, idx: number) =>
      buildWhereExpr(w, `${pfx}_and${idx}`, columns, params, paramTypes, c),
    );
    const xs = inner.filter(Boolean).map(parensIfNeeded);
    if (xs.length) parts.push(xs.join(' AND '));
  }

  // OR
  if (Array.isArray((where as any).OR) && (where as any).OR.length) {
    const inner = (where as any).OR.map((w: any, idx: number) =>
      buildWhereExpr(w, `${pfx}_or${idx}`, columns, params, paramTypes, c),
    );
    const xs = inner.filter(Boolean).map(parensIfNeeded);
    if (xs.length) parts.push(`(${xs.join(' OR ')})`);
  }

  // NOT
  if ((where as any).NOT) {
    const inner = buildWhereExpr((where as any).NOT, `${pfx}_not`, columns, params, paramTypes, c);
    if (inner) parts.push(`NOT ${parensIfNeeded(inner)}`);
  }

  const cleaned = parts.filter(Boolean);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0]!;
  return cleaned.map(parensIfNeeded).join(' AND ');
}

function buildWhere<M>(
  where: Where<M> | undefined,
  pfx: string,
  columns: Record<string, ColumnDef<any>>,
  params: Record<string, any>,
  paramTypes: Record<string, Ydb.IType>,
): string {
  const expr = buildWhereExpr(where, pfx, columns, params, paramTypes, { i: 0 });
  return expr ? `WHERE ${expr}` : '';
}

function buildOrderBy<M>(orderBy: OrderBy<M> | undefined): string {
  if (!orderBy) return '';
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts: string[] = [];
  for (const obj of items) {
    for (const [k, dir] of Object.entries(obj as any)) {
      if (!dir) continue;
      parts.push(`${ident(k)} ${String(dir).toUpperCase()}`);
    }
  }
  return parts.length ? `ORDER BY ${parts.join(', ')}` : '';
}

function buildReturning<M>(cols: (keyof M & string)[], returning?: Select<M>): string {
  if (!returning) return '';
  const list = cols.filter((c) => (returning as any)[c]).map(ident);
  return list.length ? `RETURNING ${list.join(', ')}` : '';
}

function pickSelected<M extends Record<string, any>>(row: M, select?: Select<M>): Partial<M> {
  if (!select) return row;
  const out: Partial<M> = {};
  for (const [k, v] of Object.entries(select)) {
    if (v) (out as any)[k] = (row as any)[k];
  }
  return out;
}

function withDeclares(text: string, paramTypes: Record<string, Ydb.IType>): string {
  const names = Object.keys(paramTypes);
  if (names.length === 0) return text;
  const decl = names
    .sort()
    .map((n) => `DECLARE $${n} AS ${ydbTypeToYqlString(paramTypes[n]!)};`)
    .join('\n');
  return `${decl}\n\n${text}`;
}

function assertUniqueByPrimaryKey<M extends Record<string, any>>(
  model: { def: ModelDef<any> },
  where: WhereFields<M>,
): void {
  const pk = model.def.primaryKey as string[];
  for (const k of pk) {
    const ops = (where as any)[k];
    if (!ops || typeof ops !== 'object' || !('=' in ops)) {
      throw new Error(`findUnique requires equality for primary key field: ${k}`);
    }
  }
}

export class ModelClient<M extends Record<string, any>> {
  constructor(
    private readonly model: {
      name: string;
      def: ModelDef<any>;
      columns: (keyof M & string)[];
      columnDefs: Record<string, ColumnDef<any>>;
    },
    private readonly adapter: Adapter,
  ) {}

  async findMany(): Promise<Array<M>>;
  async findMany<const Sel extends Select<M>>(args: FindManyArgs<M> & { select: Sel }): Promise<Array<SelectResult<M, Sel>>>;
  async findMany(args: FindManyArgs<M> = {}): Promise<Array<any>> {

    const params: Record<string, any> = {};
    const paramTypes: Record<string, Ydb.IType> = {};

    const selectClause = buildSelect<M>(this.model.columns, args.select);
    const whereClause = buildWhere(args.where, `${this.model.name}_w`, this.model.columnDefs, params, paramTypes);
    const orderByClause = buildOrderBy<M>(args.orderBy);

    const limit = args.take ?? args.limit;
    const offset = args.skip ?? args.offset;

    const limitClause = limit ? `LIMIT ${limit}` : '';
    const offsetClause = offset ? `OFFSET ${offset}` : '';

    const stmt = `SELECT ${selectClause} FROM ${ident(this.model.def.table)} ${whereClause} ${orderByClause} ${limitClause} ${offsetClause}`.trim();
    const text = withDeclares(stmt, paramTypes);
    const rows = await this.adapter.query({ text, params, paramTypes });
    return rows.map((r) => pickSelected(r as any, args.select));
  }

  async findFirst(): Promise<M | null>;
  async findFirst<const Sel extends Select<M>>(args: FindFirstArgs<M> & { select: Sel }): Promise<SelectResult<M, Sel> | null>;
  async findFirst(args: FindFirstArgs<M> = {}): Promise<any | null> {
    const rows = await this.findMany({ ...args, limit: args.limit ?? 1 } as any);
    return rows[0] ?? null;
  }

  async findUnique(args: FindUniqueArgs<M>): Promise<M | null>;
  async findUnique<const Sel extends Select<M>>(args: FindUniqueArgs<M> & { select: Sel }): Promise<SelectResult<M, Sel> | null>;
  async findUnique(args: FindUniqueArgs<M>): Promise<any | null> {
    assertUniqueByPrimaryKey(this.model, args.where);
    // Reuse findFirst machinery
    return this.findFirst({ where: args.where as any, select: args.select, limit: 1 } as any);
  }

  async create(args: CreateArgs<M>): Promise<M | null>;
  async create<const Ret extends Select<M>>(args: CreateArgs<M> & { returning: Ret }): Promise<SelectResult<M, Ret> | null>;
  async create(args: CreateArgs<M>): Promise<any | null> {
    const cols = Object.keys(args.data) as (keyof M & string)[];
    const params: Record<string, any> = {};
    const paramTypes: Record<string, Ydb.IType> = {};

    const names = cols.map(ident).join(', ');
    const values = cols
      .map((c, i) => {
        const pn = `${this.model.name}_c_${i}`;
        const v = (args.data as any)[c];
        const colDef = this.model.columnDefs[c];
        if (!colDef) throw new Error(`Unknown column in create: ${String(c)}`);

        if (v === null && !(colDef as any).isNullable) {
          throw new Error(`Non-nullable column cannot be null: ${String(c)}`);
        }

        params[pn] = v;
        paramTypes[pn] = columnYdbType(colDef);
        return param(pn);
      })
      .join(', ');

    const returningClause = buildReturning<M>(this.model.columns, args.returning);

    const stmt = `UPSERT INTO ${ident(this.model.def.table)} (${names}) VALUES (${values}) ${returningClause}`.trim();
    const text = withDeclares(stmt, paramTypes);
    const rows = await this.adapter.query({ text, params, paramTypes });
    const row = rows[0] as any;
    return row ? (args.returning ? pickSelected(row, args.returning as any) : row) : null;
  }

  async upsert(args: UpsertArgs<M>): Promise<M | null>;
  async upsert<const Ret extends Select<M>>(args: UpsertArgs<M> & { returning: Ret }): Promise<SelectResult<M, Ret> | null>;
  async upsert(args: UpsertArgs<M>): Promise<any | null> {
    assertUniqueByPrimaryKey(this.model, args.where);

    const { runInTransaction } = await import('./tx.js');

    return runInTransaction(this.adapter as any, async () => {
      // 1) Try update
      const updated = await this.update({
        where: args.where as any,
        data: args.update,
        returning: args.returning,
      } as any);
      if (updated) return updated;

      // 2) Create: ensure PK fields present
      const pk = this.model.def.primaryKey as string[];
      const pkData: any = {};
      for (const k of pk) {
        const ops = (args.where as any)[k];
        pkData[k] = ops?.['='];
      }

      const created = await this.create({
        data: { ...pkData, ...(args.create as any) },
        returning: args.returning,
      } as any);
      return created;
    });
  }

  async createMany(args: CreateManyArgs<M>): Promise<{ count: number }> {
    if (!args.data.length) return { count: 0 };

    // Use union of keys present in any row.
    const cols = Array.from(new Set(args.data.flatMap((r) => Object.keys(r as any)))) as (keyof M & string)[];
    if (!cols.length) return { count: 0 };

    // Validate and normalize rows: fill missing keys with null.
    const rows = args.data.map((r) => {
      const out: any = {};
      for (const c of cols) {
        const colDef = this.model.columnDefs[c];
        if (!colDef) throw new Error(`Unknown column in createMany: ${String(c)}`);

        const v = (r as any)[c];
        if (v === undefined) {
          out[c] = null;
          if (!(colDef as any).isNullable) {
            throw new Error(`Missing value for non-nullable column in createMany: ${String(c)}`);
          }
        } else {
          if (v === null && !(colDef as any).isNullable) {
            throw new Error(`Non-nullable column cannot be null in createMany: ${String(c)}`);
          }
          out[c] = v;
        }
      }
      return out;
    });

    const structMembers = cols.map((c) => ({ name: c, type: columnYdbType(this.model.columnDefs[c]!) }));
    const rowType: Ydb.IType = { structType: { members: structMembers as any } };
    const rowsType: Ydb.IType = { listType: { item: rowType } };

    const params: Record<string, any> = { rows };
    const paramTypes: Record<string, Ydb.IType> = { rows: rowsType };

    const names = cols.map(ident).join(', ');
    const selectList = cols.map((c) => ident(c)).join(', ');

    const stmt = `UPSERT INTO ${ident(this.model.def.table)} (${names}) SELECT ${selectList} FROM AS_TABLE($rows)`;
    const text = withDeclares(stmt, paramTypes);
    await this.adapter.query({ text, params, paramTypes });

    return { count: args.data.length };
  }

  async update(args: UpdateArgs<M>): Promise<M | null>;
  async update<const Ret extends Select<M>>(args: UpdateArgs<M> & { returning: Ret }): Promise<SelectResult<M, Ret> | null>;
  async update(args: UpdateArgs<M>): Promise<any | null> {
    const params: Record<string, any> = {};
    const paramTypes: Record<string, Ydb.IType> = {};

    const setParts: string[] = [];
    let i = 0;
    for (const [col, value] of Object.entries(args.data as any)) {
      const pn = `${this.model.name}_u_${i++}`;
      const colDef = this.model.columnDefs[col];
      if (!colDef) throw new Error(`Unknown column in update: ${col}`);

      if (value === null && !(colDef as any).isNullable) {
        throw new Error(`Non-nullable column cannot be null: ${col}`);
      }

      params[pn] = value;
      // nullable column already maps to Optional<T>
      paramTypes[pn] = columnYdbType(colDef);
      setParts.push(`${ident(col)} = ${param(pn)}`);
    }

    const setClause = setParts.length ? `SET ${setParts.join(', ')}` : '';
    const whereClause = buildWhere(
      args.where,
      `${this.model.name}_uw`,
      this.model.columnDefs,
      params,
      paramTypes,
    );
    const returningClause = buildReturning<M>(this.model.columns, args.returning);

    const stmt = `UPDATE ${ident(this.model.def.table)} ${setClause} ${whereClause} ${returningClause}`.trim();
    const text = withDeclares(stmt, paramTypes);
    const rows = await this.adapter.query({ text, params, paramTypes });
    const row = rows[0] as any;
    return row ? (args.returning ? pickSelected(row, args.returning as any) : row) : null;
  }

  async updateMany(args: UpdateManyArgs<M>): Promise<{ count: number }> {
    const params: Record<string, any> = {};
    const paramTypes: Record<string, Ydb.IType> = {};

    const setParts: string[] = [];
    let i = 0;
    for (const [col, value] of Object.entries(args.data as any)) {
      const pn = `${this.model.name}_um_${i++}`;
      const colDef = this.model.columnDefs[col];
      if (!colDef) throw new Error(`Unknown column in updateMany: ${col}`);

      if (value === null && !(colDef as any).isNullable) {
        throw new Error(`Non-nullable column cannot be null: ${col}`);
      }

      params[pn] = value;
      paramTypes[pn] = columnYdbType(colDef);
      setParts.push(`${ident(col)} = ${param(pn)}`);
    }

    const setClause = setParts.length ? `SET ${setParts.join(', ')}` : '';
    const whereClause = buildWhere(
      args.where,
      `${this.model.name}_umw`,
      this.model.columnDefs,
      params,
      paramTypes,
    );

    // Use RETURNING 1 to count affected rows reliably without relying on SDK-specific metadata.
    const stmt = `UPDATE ${ident(this.model.def.table)} ${setClause} ${whereClause} RETURNING 1 AS __ydb_orm_one`.trim();
    const text = withDeclares(stmt, paramTypes);
    const rows = await this.adapter.query({ text, params, paramTypes });
    return { count: rows.length };
  }

  async delete(args: DeleteArgs<M>): Promise<M | null>;
  async delete<const Ret extends Select<M>>(args: DeleteArgs<M> & { returning: Ret }): Promise<SelectResult<M, Ret> | null>;
  async delete(args: DeleteArgs<M>): Promise<any | null> {
    const params: Record<string, any> = {};
    const paramTypes: Record<string, Ydb.IType> = {};

    const whereClause = buildWhere(
      args.where,
      `${this.model.name}_dw`,
      this.model.columnDefs,
      params,
      paramTypes,
    );
    const returningClause = buildReturning<M>(this.model.columns, args.returning);

    const stmt = `DELETE FROM ${ident(this.model.def.table)} ${whereClause} ${returningClause}`.trim();
    const text = withDeclares(stmt, paramTypes);
    const rows = await this.adapter.query({ text, params, paramTypes });
    const row = rows[0] as any;
    return row ? (args.returning ? pickSelected(row, args.returning as any) : row) : null;
  }

  async deleteMany(args: DeleteManyArgs<M> = {}): Promise<{ count: number }> {
    const params: Record<string, any> = {};
    const paramTypes: Record<string, Ydb.IType> = {};

    const whereClause = buildWhere(
      args.where,
      `${this.model.name}_dmw`,
      this.model.columnDefs,
      params,
      paramTypes,
    );

    const stmt = `DELETE FROM ${ident(this.model.def.table)} ${whereClause} RETURNING 1 AS __ydb_orm_one`.trim();
    const text = withDeclares(stmt, paramTypes);
    const rows = await this.adapter.query({ text, params, paramTypes });
    return { count: rows.length };
  }
}

export type OrmClient<S extends SchemaDef> = Simplify<{
  [K in keyof S]: ModelClient<InferModel<S[K]>>;
}>;

export type OrmRoot<S extends SchemaDef> = OrmClient<S> & {
  $transaction: <T>(fn: (tx: OrmClient<S>) => Promise<T>) => Promise<T>;
};

export function ydbOrm<const S extends SchemaDef>(opts: { schema: S; adapter: Adapter }): OrmRoot<S> {
  const out: any = {};
  for (const [name, def] of Object.entries(opts.schema)) {
    const columns = Object.keys(def.columns);
    out[name] = new ModelClient(
      { name, def: def as any, columns: columns as any, columnDefs: def.columns as any },
      opts.adapter,
    );
  }

  out.$transaction = async (fn: any) => {
    const { runInTransaction } = await import('./tx.js');
    return runInTransaction(opts.adapter as any, async () => {
      return fn(out as OrmClient<S>);
    });
  };

  return out as OrmRoot<S>;
}
