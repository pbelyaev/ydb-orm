import type { Ydb } from 'ydb-sdk';
import { primitiveTypeToValue } from 'ydb-sdk';

function primitiveNameToYql(name: string): string {
  // YDB SDK uses proto enum names (e.g. UTF8, UINT64, JSON_DOCUMENT)
  switch (name) {
    case 'UTF8':
      return 'Utf8';
    case 'TEXT':
      return 'String';
    case 'BOOL':
      return 'Bool';
    case 'INT32':
      return 'Int32';
    case 'INT64':
      return 'Int64';
    case 'UINT32':
      return 'Uint32';
    case 'UINT64':
      return 'Uint64';
    case 'TIMESTAMP':
      return 'Timestamp';
    case 'BYTES':
      return 'Bytes';
    case 'YSON':
      return 'Yson';
    case 'JSON':
      return 'Json';
    case 'JSON_DOCUMENT':
      return 'JsonDocument';
    default:
      // Fallback: keep SDK spelling.
      return name;
  }
}

export function ydbTypeToYqlString(t: Ydb.IType): string {
  if ((t as any).optionalType?.item) {
    return `Optional<${ydbTypeToYqlString((t as any).optionalType.item)}>`;
  }
  if ((t as any).listType?.item) {
    return `List<${ydbTypeToYqlString((t as any).listType.item)}>`;
  }
  if (typeof (t as any).typeId === 'number') {
    const name = primitiveTypeToValue[(t as any).typeId];
    if (!name) throw new Error(`Unknown primitive typeId: ${(t as any).typeId}`);
    return primitiveNameToYql(name);
  }

  throw new Error(`Unsupported YDB type shape: ${JSON.stringify(t)}`);
}
