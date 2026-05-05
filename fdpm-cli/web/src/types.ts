export interface WorkbookSummary {
  id: string;
  name: string;
  profile_id: string;
  revision: number;
}

export interface WorkbookListResponse {
  workbooks: WorkbookSummary[];
}

export interface Workbook {
  id: string;
  name: string;
  profile_id: string;
  created_at: string;
  revision: number;
  description?: string;
}

export interface Primitive {
  id: string;
  uid: string;
  type_id: string;
  field_values: Record<string, unknown>;
  revision: number;
  scope_id?: string;
  parent_id?: string;
}

export interface Relation {
  id?: string;
  uid?: string;
  type_id: string;
  src_id?: string;
  dst_id?: string;
  source_id?: string;
  target_id?: string;
  field_values?: Record<string, unknown>;
  revision?: number;
}

export interface WorkbookDetailResponse {
  workbook: Workbook;
  primitives: Record<string, Primitive>;
  relations?: Record<string, Relation> | Relation[];
}

export interface BridgeError {
  error: string;
  detail?: unknown;
}

export interface PluginSummary {
  id: string;
  version: string;
  kind: string;
  state: string;
  trust: string;
  capabilities: number;
}

export interface PluginListResponse {
  plugins: PluginSummary[];
}

export interface CapabilityDecl {
  capability_id: string;
  local_name: string;
  entry: string;
  metadata?: Record<string, unknown>;
}

export interface PluginContributions {
  profiles: string[];
  validators: number;
  renderers: number;
  transformers: number;
  importers: number;
  exporters: number;
}

export interface PluginSource {
  kind: string;
  root: string;
  manifestPath: string;
  builtin: boolean;
}

export interface PluginRecord {
  id: string;
  version: string;
  state: string;
  trust: string;
  kind: string;
  permissions: string[];
  capabilities: CapabilityDecl[];
  contributions: PluginContributions;
  source: PluginSource;
}

export interface PluginManifest {
  id: string;
  version: string;
  spec_version?: string;
  kind: string;
  name: string;
  description?: string;
  authors?: string[];
  license?: string;
  host_compatibility?: Record<string, string>;
  permissions?: string[];
  capabilities?: CapabilityDecl[];
}

export interface PluginReadmeResponse {
  markdown: string;
}

export interface ProfileSummary {
  id: string;
  version: string;
  label: string;
  primitive_type_count: number;
  relation_type_count: number;
}

export interface ProfileListResponse {
  profiles: ProfileSummary[];
}

export interface ProfileFieldValidation {
  rule_id?: string;
  [k: string]: unknown;
}

export interface ProfileField {
  name: string;
  kind: string;
  legacy_type?: string;
  required: boolean;
  description?: string;
  validations?: ProfileFieldValidation[];
}

export interface ProfileIdFormat {
  pattern: string;
  uniqueness: string;
  pattern_kind: string;
}

export interface ProfilePrimitiveType {
  id: string;
  name: string;
  category_id?: string;
  category?: string;
  description?: string;
  scoped?: boolean;
  id_format?: ProfileIdFormat;
  fields: ProfileField[];
}

export interface ProfileRelationType {
  id: string;
  name?: string;
  description?: string;
  /** Some plugins emit a single string, some a list. Normalize at the call site. */
  source_types?: string | string[];
  target_types?: string | string[];
  fields?: ProfileField[];
}

export interface ProfileDetail {
  id: string;
  version: string;
  name: string;
  label: string;
  description?: string;
  extends?: string[];
  categories?: Array<{ id: string; name: string; description?: string; label?: string }>;
  scopes?: Array<{ id: string; name: string; rank?: number; description?: string; label?: string }>;
  primitive_types: ProfilePrimitiveType[];
  relation_types: ProfileRelationType[];
}
