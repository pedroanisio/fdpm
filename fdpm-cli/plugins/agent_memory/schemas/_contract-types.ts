/**
 * The two result types the vendored contract imports from its sibling
 * module in the source repository.
 *
 * Reproduced here verbatim from `src/loop-forward.schema.ts` of the
 * source repo so `schemas/agent-memory.ts` can stay a byte-for-byte
 * copy but for its import line. See `scripts/vendor-agent-memory.ts`
 * for the one mechanical rewrite the vendoring performs.
 */

/** One reason a value was refused, and where in the value it lives. */
export interface Issue {
  readonly path: string;
  readonly message: string;
}

/** Outcome of a parse: either the typed value, or every reason it was refused. */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly issues: readonly Issue[] } };
