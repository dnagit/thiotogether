import { z } from 'zod';

/**
 * Admin form inputs send `""` for a field the user cleared, but `""` fails the
 * format checks (url / email / date / regex) that were only ever meant to run on a
 * real value — so clearing an *optional* field would 422 instead of saving.
 *
 * Wrap the field to read `""` as "no value": it validates, and it lands in the
 * column as NULL rather than an empty string that later renders as a broken
 * `<img src="">` or an empty `mailto:`.
 */
export function blank<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), schema);
}

/**
 * Same idea for fields the server fills in when absent (e.g. a slug derived from
 * the name): `""` must read as "not provided", not as an invalid value.
 */
export function blankToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  );
}
