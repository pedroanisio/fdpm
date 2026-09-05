/**
 * Profile-specific wiring the executor cannot infer from loop-forward alone:
 * which edge names a stage's delegation modes, which edge links a receipt to
 * its submissions, which bindings a driver consumes rather than the prompt,
 * and how the Codex wrapper is invoked for the pipeline's solver stages.
 *
 * Shared by the CLI (scripts/run-loop-forward.ts) and the MCP loop server so
 * the two cannot run the same pipeline differently.
 */

export interface ProfileWiring {
  modeRelationType?: string;
  submissionEdgeType?: string;
  modeBinding?: string;
  driverConsumed: string[];
  /** Every solver call runs in this mode (pipelines whose stages carry no mode binding). */
  codexFixedMode?: string;
  /** Hand the stage the wrapper envelope's `return` payload rather than the envelope. */
  codexUnwrapEnvelope?: boolean;
}

const WIRING: ReadonlyArray<[prefix: string, wiring: ProfileWiring]> = [
  ["profile:codex-delegation", { modeRelationType: "cdel:StageRunsInMode", submissionEdgeType: "cdel:ReceiptSubmitted", modeBinding: "mode", driverConsumed: ["repo_path", "mode"] }],
  // The frontier loop's stages carry no repository or mode binding: every
  // solver call is an attempt-mode delegation against the repository root,
  // and its attempt contract is written over the raw attempt payload.
  ["profile:frontier-proof-loop", { submissionEdgeType: "fpl:ReceiptSubmitted", driverConsumed: [], codexFixedMode: "attempt", codexUnwrapEnvelope: true }],
];

export function wiringFor(profileId: string): ProfileWiring {
  const found = WIRING.find(([prefix]) => profileId.startsWith(prefix));
  return found ? found[1] : { driverConsumed: [] };
}
