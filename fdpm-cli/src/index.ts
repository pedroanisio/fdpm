// Public re-exports for embedding the CLI core programmatically.
export { Host } from "./core/host.js";
export { Store } from "./core/store/store.js";
export { ProfileRegistry } from "./core/profile/registry.js";
export { ValidationPipeline } from "./core/validation/pipeline.js";
export { CORE_EMPTY_PROFILE } from "./core/profile/core-empty.js";
export { FDPMException } from "./core/errors/fdpm-exception.js";
export {
  SPEC_CORE_VERSION,
  SPEC_CORE_REVISION,
  HOST_NAME,
  HOST_VERSION,
} from "./core/version/spec.js";
export * from "./core/models/meta.js";
export * from "./core/models/instance.js";
export * from "./core/operations/kinds.js";
export * from "./core/operations/operation.js";
export * from "./core/operations/payloads.js";
export { replay, sliceProject } from "./core/store/replay.js";
export { computeInverse } from "./core/operations/inverse.js";
export { applyPatch, type JsonPatchOp } from "./core/operations/json-patch.js";
export {
  splitProject,
  cloneProject,
  batchEdit,
  undo,
  rebuildFromLog,
  exportTransfer,
  importTransfer,
  createTemplate,
  applyTemplate,
  createTestSuite,
  runTestSuite,
} from "./core/host-extra.js";
export { buildAuditRecord, type AuditRecord } from "./core/audit/projection.js";
export * from "./core/dnis/index.js";

// SDK — programmatic facade for embedding (see src/sdk.ts docstring
// for the design rationale and stability contract).
export {
  openHost,
  defineProject,
  ProjectBuilder,
  patchPrimitive,
  patchRelation,
  deletePrimitive,
  deleteRelation,
  renderProject,
  type HostOptions,
  type ProjectHeader,
  type PrimitiveSpec,
  type RelationSpec,
  type CommitOptions,
  type CommitResult,
  type PartialCommitFailure,
  type PatchPrimitiveInput,
  type PatchRelationInput,
  type PatchResult,
  type DeleteResult,
  type RenderOptions,
  type RenderResult,
  previewPrimitiveDelete,
  previewRelationDelete,
  previewWorkbookDelete,
  auditReport,
  listPrompts,
  renderPrompt,
} from "./sdk.js";
