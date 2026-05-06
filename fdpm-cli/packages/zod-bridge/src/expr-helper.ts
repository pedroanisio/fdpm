/**
 * cap:expr-helper derivation — Zod predicate exposed as a CEL function.
 *
 * Per howto-zod-to-fdpm-plugin §7 / `example:bridge-expr-helper`.
 *
 * The helper wraps `schema.safeParse(arg).success` so a CEL expression
 * can ask "is this object a valid <Entity>?" Purity is mandatory
 * (def:cap-expr-helper): no IO, no clock, no randomness. The helper
 * is referentially transparent over its declared domain.
 */

import type { ZodObject, ZodRawShape } from "zod";

export interface ExprHelperOptions {
  function_name: string;
  arity: number;
  arg_types: ReadonlyArray<string>;
  return_type: "boolean";
  /** Optional: override the manifest entry name (default: derived from function_name). */
  entry?: string;
}

export interface ExprHelperCapability {
  capability_id: "cap:expr-helper";
  local_name: string;
  entry: string;
  metadata: {
    function_name: string;
    arity: number;
    arg_types: ReadonlyArray<string>;
    return_type: "boolean";
    pure: true;
  };
}

export interface ExprHelperResult {
  fn: (arg: unknown) => boolean;
  capability: ExprHelperCapability;
}

export function zodSchemaToExprHelper(
  schema: ZodObject<ZodRawShape>,
  opts: ExprHelperOptions,
): ExprHelperResult {
  const fn = (arg: unknown): boolean => schema.safeParse(arg).success;

  const tail = opts.function_name.split(".").pop() ?? opts.function_name;
  const entry = opts.entry ?? tail;
  return {
    fn,
    capability: {
      capability_id: "cap:expr-helper",
      local_name: kebabify(tail),
      entry,
      metadata: {
        function_name: opts.function_name,
        arity: opts.arity,
        arg_types: opts.arg_types,
        return_type: opts.return_type,
        pure: true,
      },
    },
  };
}

function kebabify(s: string): string {
  return s
    .replace(/[A-Z]+/g, (m) => `-${m.toLowerCase()}`)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
