import type { Primitive } from './types.js';

export type YqlParam = Primitive;

export type BuiltQuery = {
  text: string;
  params: Record<string, YqlParam>;
};

export function ident(name: string): string {
  // YQL identifiers can be escaped with backticks.
  // We keep it simple & safe: always backtick-escape and double any backticks.
  const escaped = name.replace(/`/g, '``');
  return `\`${escaped}\``;
}

export function param(name: string): string {
  return `$${name}`;
}

export function and(parts: string[]): string {
  const xs = parts.filter(Boolean);
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0]!;
  return `(${xs.join(' AND ')})`;
}

export function or(parts: string[]): string {
  const xs = parts.filter(Boolean);
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0]!;
  return `(${xs.join(' OR ')})`;
}
