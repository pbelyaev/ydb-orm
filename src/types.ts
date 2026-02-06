export type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type Nullable<T> = T | null;

export type Primitive = string | number | boolean | bigint | Uint8Array | Date | null;

export type DeepPartial<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;
