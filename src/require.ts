import { createRequire } from 'node:module';

/**
 * A safe `require` that works in both ESM and CJS builds.
 *
 * We intentionally avoid using `import.meta` directly because some bundlers
 * (e.g. tsup when emitting CJS) will replace it and may warn or break.
 */
function getMetaUrl(): string {
  try {
    // Use eval to avoid referencing `import.meta` syntactically in CJS output.
    return (0, eval)('import.meta.url') as string;
  } catch {
    return '';
  }
}

export const require = createRequire(
  // __filename exists in CJS; in ESM it's undefined.
  typeof __filename !== 'undefined' ? __filename : getMetaUrl(),
);
