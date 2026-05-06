/**
 * @fdpm/zod-bridge
 *
 * Deterministic, one-way translation from Zod v4 schemas into FDPM
 * PrimitiveTypeDefs, CEL constraints, validators, and approval-page
 * descriptors. Companion to the workbook howto-zod-to-fdpm-plugin
 * (revision 179) which is the normative spec for everything this
 * package emits.
 *
 * ARCHITECTURAL CONTRACT (PALS's LAW):
 *   The bridge consumes Zod schemas and emits FDPM artefacts. The
 *   schemas themselves are author-controlled; the bridge does not
 *   call any LLM. Outputs are still verified end-to-end:
 *     - testcase:bridge-mapping-table
 *     - testcase:cel-translation-table
 *     - testcase:bridge-validator-equivalence
 *     - testcase:bridge-roundtrip
 *     - testcase:bridge-determinism
 */

export { zodSchemaToCelConstraints } from "./cel.js";
export { classifySchemas, renderAuditLog } from "./classifier.js";
export { mapField } from "./field-mapping.js";
export { zodSchemaToPrimitiveType } from "./primitive.js";
export { zodSchemaToValidator, enumerateRuleIds } from "./validator.js";
export {
  buildViewPageDescriptor,
  zodSchemaToViewPagePanel,
} from "./view-page.js";
export {
  buildProductPageBundle,
  DEFAULT_FEATURE_FLAG_STATES,
} from "./product-page.js";
export { assembleDomainProfile } from "./orchestrator.js";
export {
  assembleDomainProfileFromSidecar,
  hashSchemaSource,
} from "./sidecar-orchestrator.js";
export type {
  SidecarBridgeArgs,
  SidecarBridgeResult,
  UslNgCompanion,
} from "./sidecar-orchestrator.js";
export {
  defineDomain,
} from "./sidecar-types.js";
export type {
  Domain,
  EntitySpec,
  IdentityKind,
  ReferenceSpec,
  ReferenceCardinality,
  ReferenceInverse,
  CascadeKind,
  AggregateSpec,
  VariantSpec,
  VariantStrategy,
  VariantReferenceSpec,
  LiftOverrides,
  LiftOverrideKind,
  DeclaredLossSpec,
  LossKind,
  LossClassification,
  FdpmSection,
  DnisSection,
  DnisManagedField,
  DnisLineage,
  SchemaHashManifest,
  SidecarSpecVersion,
} from "./sidecar-types.js";
export {
  validateDomain,
  SidecarError,
} from "./sidecar-validator.js";
export type {
  SidecarErrorCode,
  ValidateResult,
} from "./sidecar-validator.js";
export type {
  SidecarAuditLog,
  DivergenceEntry,
  OverrideEntry,
  LossEntry,
} from "./sidecar-audit.js";

// File-emission and capability-derivation surfaces
// (workbook howto-zod-to-fdpm-plugin §2 + §7).
export { writeArtefactsToDir, writePluginScaffold } from "./scaffold.js";
export type {
  WriteArtefactsOptions,
  ScaffoldOptions,
  ScaffoldResult,
} from "./scaffold.js";
export { zodSchemaToMarkdownRenderer } from "./renderers.js";
export type {
  RenderTarget,
  FieldOrder,
  MarkdownRendererOptions,
  MarkdownRendererCapability,
  MarkdownRendererResult,
} from "./renderers.js";
export { zodSchemaToImporter, zodSchemaToExporter } from "./io.js";
export type {
  PrimitiveCreateIntent,
  ImporterOptions,
  ImporterCapability,
  ImporterResult,
  ImporterEmission,
  WorkbookView,
  ExporterOptions,
  ExporterCapability,
  ExporterEmission,
} from "./io.js";
export { zodSchemaToExprHelper } from "./expr-helper.js";
export type {
  ExprHelperOptions,
  ExprHelperCapability,
  ExprHelperResult,
} from "./expr-helper.js";

export { stableStringify } from "./stable-stringify.js";
export { BridgeError } from "./walker.js";
export type {
  AuditLog,
  ClassificationCandidate,
  ClassificationEntry,
  ClassificationReason,
  ShapeKind,
} from "./classifier.js";
export type {
  AssembleResult,
  BridgeOptions,
  CelSidecar,
  Constraint,
  DomainProfile,
  EnumDef,
  FieldDef,
  FieldKind,
  Finding,
  MigrationHints,
  PrimitiveTypeDef,
  ProductPageBundle,
  ProductSchemaSummary,
  RelationTypeDef,
  StructDef,
  ValidationRule,
  ValidatorFn,
  ViewPageDescriptor,
  ViewPageFieldRender,
  ViewPagePanel,
} from "./types.js";
