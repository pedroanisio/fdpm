import type { DomainProfile } from "../models/meta.js";

/**
 * §1.5 The `core:empty` profile — the single Core-shipped profile.
 *
 * Declares no primitive types, no relation types, one default scope, one
 * default category. Its sole purpose is to make §10.2 baseline bullet 3
 * satisfiable in a zero-plugins state. Plugins MUST NOT depend on it;
 * profile authors MUST NOT extend it.
 */
export const CORE_EMPTY_PROFILE: DomainProfile = {
  id: "core:empty",
  version: "1.0.0",
  label: "Core (empty)",
  description: "Zero-plugins seed profile. Contains no domain semantics.",
  extends: [],
  categories: [
    { id: "core:category:general", label: "General" },
  ],
  scopes: [
    { id: "core:scope:doc", label: "Document", rank: 0 },
  ],
  primitive_types: [],
  relation_types: [],
  validation_rules: [],
  renderer_bindings: [],
  renderers: [],
  inline_structs: [],
  templates: [],
  scope_sets: {},
  default_scope_set: "",
};
