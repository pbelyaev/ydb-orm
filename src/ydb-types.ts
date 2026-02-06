import { createRequire } from 'node:module';
import type { Ydb } from 'ydb-sdk';

// Works in both ESM and CJS builds
const require = createRequire(typeof __filename === 'string' ? __filename : import.meta.url);
const ydb: any = require('ydb-sdk');
const { Types } = ydb;

// IMPORTANT:
// ydb-sdk exports `primitiveTypeToValue` which maps typeId -> *value field name* (e.g. uint64Value),
// but YQL DECLARE needs *type name* (Uint64). So we build our own mapping from Types.*.
const typeIdToYql = new Map<number, string>([
  [Types.BOOL.typeId, 'Bool'],
  [Types.INT32.typeId, 'Int32'],
  [Types.INT64.typeId, 'Int64'],
  [Types.UINT32.typeId, 'Uint32'],
  [Types.UINT64.typeId, 'Uint64'],
  // NOTE: ydb-sdk currently represents both TEXT/UTF8 with the same primitive typeId.
  // For YQL DECLARE we default to Utf8, which matches typical table schemas.
  [Types.UTF8.typeId, 'Utf8'],
  [Types.TEXT.typeId, 'Utf8'],

  [Types.TIMESTAMP.typeId, 'Timestamp'],
  [Types.JSON.typeId, 'Json'],
  [Types.JSON_DOCUMENT.typeId, 'JsonDocument'],
  [Types.YSON.typeId, 'Yson'],
  [Types.BYTES.typeId, 'Bytes'],
]);

export function ydbTypeToYqlString(t: Ydb.IType): string {
  if ((t as any).optionalType?.item) {
    return `Optional<${ydbTypeToYqlString((t as any).optionalType.item)}>`;
  }
  if ((t as any).listType?.item) {
    return `List<${ydbTypeToYqlString((t as any).listType.item)}>`;
  }
  if ((t as any).structType?.members) {
    const members = (t as any).structType.members as Array<{ name: string; type: Ydb.IType }>;
    const inner = members
      .map((m) => {
        // YQL struct member names are quoted with single quotes
        const name = String(m.name).replace(/'/g, "''");
        return `'${name}':${ydbTypeToYqlString(m.type)}`;
      })
      .join(',');
    return `Struct<${inner}>`;
  }

  if (typeof (t as any).typeId === 'number') {
    const name = typeIdToYql.get((t as any).typeId);
    if (!name) throw new Error(`Unknown typeId for DECLARE: ${(t as any).typeId}`);
    return name;
  }

  throw new Error('Unsupported YDB type shape for DECLARE');
}
