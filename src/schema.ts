import type { Simplify } from './types.js';
import type { Ydb } from 'ydb-sdk';
import { require } from './require.js';

const ydb: any = require('ydb-sdk');
const { Types } = ydb;

export type ColumnTypeName =
  | 'Bool'
  | 'Int32'
  | 'Int64'
  | 'Uint32'
  | 'Uint64'
  | 'Utf8'
  | 'String'
  | 'Timestamp'
  | 'Json'
  | 'JsonDocument'
  | 'Yson'
  | 'Bytes';

export type ColumnDef<T> = {
  yqlType: ColumnTypeName;
  /** When present, column is nullable. Kept as literal `true` to preserve type narrowing. */
  isNullable?: true;
  // for future: default, validators, etc.
  __ts?: (v: T) => void;
};

export type YdbType = Ydb.IType;

export function columnYdbType(c: ColumnDef<any>): YdbType {
  const base = (() => {
    switch (c.yqlType) {
      case 'Bool':
        return Types.BOOL;
      case 'Int32':
        return Types.INT32;
      case 'Int64':
        return Types.INT64;
      case 'Uint32':
        return Types.UINT32;
      case 'Uint64':
        return Types.UINT64;
      case 'Utf8':
        return Types.UTF8;
      case 'String':
        return Types.TEXT;
      case 'Timestamp':
        return Types.TIMESTAMP;
      case 'Json':
        return Types.JSON;
      case 'JsonDocument':
        return Types.JSON_DOCUMENT;
      case 'Yson':
        return Types.YSON;
      case 'Bytes':
        return Types.BYTES;
      default: {
        // exhaustive guard
        const _never: never = c.yqlType;
        return _never;
      }
    }
  })();
  return c.isNullable ? Types.optional(base) : base;
}


export const t = {
  bool: (): ColumnDef<boolean> => ({ yqlType: 'Bool' }),
  int32: (): ColumnDef<number> => ({ yqlType: 'Int32' }),
  int64: (): ColumnDef<bigint> => ({ yqlType: 'Int64' }),
  uint32: (): ColumnDef<number> => ({ yqlType: 'Uint32' }),
  uint64: (): ColumnDef<bigint> => ({ yqlType: 'Uint64' }),
  utf8: (): ColumnDef<string> => ({ yqlType: 'Utf8' }),
  string: (): ColumnDef<string> => ({ yqlType: 'String' }),
  timestamp: (): ColumnDef<Date> => ({ yqlType: 'Timestamp' }),
  json: <T = unknown>(): ColumnDef<T> => ({ yqlType: 'Json' }),
  jsonDocument: <T = unknown>(): ColumnDef<T> => ({ yqlType: 'JsonDocument' }),
  yson: <T = unknown>(): ColumnDef<T> => ({ yqlType: 'Yson' }),
  bytes: (): ColumnDef<Uint8Array> => ({ yqlType: 'Bytes' }),
};

export type ModelDef<Cols extends Record<string, ColumnDef<any>>> = {
  table: string;
  columns: Cols;
  primaryKey: readonly (keyof Cols & string)[];
};

export type SchemaDef = Record<string, ModelDef<Record<string, ColumnDef<any>>>>;

export type InferColumn<C extends ColumnDef<any>> = C extends ColumnDef<infer T>
  ? C['isNullable'] extends true
    ? T | null
    : T
  : never;

export type InferModel<M extends ModelDef<any>> = Simplify<{
  [K in keyof M['columns']]: InferColumn<M['columns'][K]>;
}>;

export function nullable<C extends ColumnDef<any>>(c: C): C & { isNullable: true } {
  return { ...(c as any), isNullable: true };
}

// Ergonomic: t.utf8().nullable()
export type NullableMethod<C extends ColumnDef<any>> = C & {
  nullable: () => C & { isNullable: true };
};

function withNullable<C extends ColumnDef<any>>(c: C): NullableMethod<C> {
  return Object.assign(c as any, {
    nullable: () => ({ ...(c as any), isNullable: true as const }),
  }) as NullableMethod<C>;
}

// Wrap all builders to provide .nullable()
for (const k of Object.keys(t) as (keyof typeof t)[]) {
  const fn = t[k];
  // @ts-expect-error runtime patch
  t[k] = (...args: any[]) => withNullable(fn(...args));
}

function validateSchema(schema: SchemaDef): void {
  for (const [modelName, model] of Object.entries(schema)) {
    const cols = model.columns ?? {};
    const colKeys = new Set(Object.keys(cols));

    if (!Array.isArray(model.primaryKey) || model.primaryKey.length === 0) {
      throw new Error(
        `Invalid schema for model "${modelName}": primaryKey must be a non-empty array`,
      );
    }

    const seen = new Set<string>();
    for (const k of model.primaryKey) {
      if (seen.has(k)) {
        throw new Error(
          `Invalid schema for model "${modelName}": primaryKey contains duplicate key "${k}"`,
        );
      }
      seen.add(k);

      if (!colKeys.has(k)) {
        throw new Error(
          `Invalid schema for model "${modelName}": primaryKey references missing column "${k}"`,
        );
      }
    }
  }
}

export function defineSchema<S extends SchemaDef>(schema: S): S {
  // Lightweight runtime validation to catch schema mistakes early.
  // (Skipped in production to avoid overhead in hot paths.)
  if (process.env.NODE_ENV !== 'production') validateSchema(schema);
  return schema;
}
