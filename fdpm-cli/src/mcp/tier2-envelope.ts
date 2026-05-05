/**
 * Tier-2 response envelope (SPEC-MCP-SERVER §8.2).
 *
 * Every Tier-2 tool returns this exact shape, regardless of which
 * Host method ran. The dispatcher then maps it onto MCP's
 * `structuredContent`/`isError` distinction:
 *
 *   - `validation_report.accepted === true`   → isError=false; structuredContent = full envelope.
 *   - `validation_report.accepted === false`  → isError=false; structuredContent = full envelope with `ok: false`. (Per §12: protocol succeeded, operation rejected.)
 *
 * `operation` is present when the Host appended an op (the happy
 * path). It MAY be absent on rejection — Host throws
 * `FDPMException("validation", ...)` in `runWithValidation` BEFORE
 * the append, so the dispatcher's catch path constructs an envelope
 * without an `operation` field. This file's type permits the absence.
 */

import { z } from "zod";
import { Operation } from "../core/operations/operation.js";
import { ValidationReport } from "../core/models/instance.js";

/**
 * Shared output schema fragment for every Tier-2 tool. Each tool's
 * `output` Zod schema extends this with its own `post_state_summary`
 * shape (e.g. `{ primitive_id, type_id, workbook_id }`).
 */
export const Tier2EnvelopeBase = {
  ok: z.boolean(),
  operation: Operation.optional(),
  validation_report: ValidationReport,
};

export interface Tier2Envelope<S> {
  ok: boolean;
  operation?: import("../core/operations/operation.js").Operation;
  validation_report: import("../core/models/instance.js").ValidationReport;
  post_state_summary: S;
}
