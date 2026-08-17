/**
 * Resolves the "now" instant used for time decisions (min-advance cutoffs,
 * relative date resolution, availability windows).
 *
 * Precedence:
 *   1. explicit `override` (ISO 8601) passed by the caller;
 *   2. `WAI_REFERENCE_TIME` env var — the controlled test clock (deterministic
 *      suites never depend on the real wall clock);
 *   3. the real wall clock.
 */
export function referenceNow(override?: string): Date {
  const raw = override || (typeof process !== 'undefined' ? process.env.WAI_REFERENCE_TIME : undefined);
  return raw ? new Date(raw) : new Date();
}
