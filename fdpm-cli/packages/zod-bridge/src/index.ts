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
