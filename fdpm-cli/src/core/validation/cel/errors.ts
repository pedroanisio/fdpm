/**
 * CEL Validator Error Taxonomy.
 *
 * Errors emitted during predicate compilation and evaluation. They extend
 * `FDPMException` so a CEL failure that escapes the local catch in the
 * validation pipeline still surfaces through the canonical error sink
 * (bin handler → JSON envelope or `error: [category] message`) instead
 * of falling through to a generic stack-trace dump.
 *
 * Category mapping mirrors `PluginError`:
 *  - `CELParseError`   → `verification` — the predicate is malformed input
 *                         and the operator can fix it (analogous to a
 *                         PALS gate failure on the predicate string).
 *  - `CELRuntimeError` → `internal`     — the predicate parsed but raised
 *                         during evaluation, which indicates a host- or
 *                         predicate-level bug rather than bad input.
 *
 * `rule_id` is preserved as a typed field AND mirrored into `evidence.rule_id`
 * so JSON consumers can attribute the failure without parsing the message.
 */
export {
  CELValidationError,
  CELParseError,
  CELRuntimeError,
} from "../../expr/errors.js";
