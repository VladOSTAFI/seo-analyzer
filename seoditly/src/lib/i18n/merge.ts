/**
 * Deep-merge a locale override OVER an English base so that any key missing
 * from the override falls back to English rather than rendering `undefined` or
 * a raw key.
 *
 * Rules:
 *   - Plain objects are merged recursively.
 *   - Arrays and primitives from the override REPLACE the base wholesale (we
 *     never element-merge arrays — a translated list is authored as a whole).
 *   - `undefined` / missing override values keep the English base value.
 *
 * The return type is the English base's type, so consumers keep full typing.
 * The override type (`DeepPartial`) WIDENS the English literal types (the base
 * is authored `as const`, so `"Sign in"` is a literal, and arrays are
 * `readonly`) to their primitive so a translator can supply any value of the
 * right shape, not the exact English literal.
 */

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Recursively widen literal types to their primitives, through objects/arrays. */
type DeepWiden<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? DeepWiden<U>[]
        : T extends object
          ? { [K in keyof T]: DeepWiden<T[K]> }
          : T;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? readonly DeepWiden<U>[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : DeepWiden<T[K]>;
};

export function mergeCopy<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override as unknown as T) ?? base;
  }

  const out: Plain = { ...base };
  for (const key of Object.keys(override)) {
    const o = (override as Plain)[key];
    if (o === undefined) continue;
    const b = (base as Plain)[key];
    out[key] = isPlainObject(b) && isPlainObject(o) ? mergeCopy(b, o) : o;
  }
  return out as T;
}
