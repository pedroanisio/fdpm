import { Host } from "../src/core/host.js";
import type { DomainProfile } from "../src/core/models/meta.js";

/** Test fixture: a small but real profile with a Section partition unit. */
export const TEST_PROFILE: DomainProfile = {
  id: "test:demo",
  version: "1.0.0",
  label: "Test Demo",
  extends: [],
  categories: [{ id: "test:cat:doc", label: "Document" }],
  scopes: [
    { id: "test:scope:doc", label: "Document", rank: 0 },
    { id: "test:scope:appendix", label: "Appendix", rank: 1 },
  ],
  primitive_types: [
    {
      id: "test:section",
      fields: [
        {
          name: "title",
          kind: "string",
          required: true,
          validations: [{ kind: "max_length", value: 200, level: "error" }],
        },
        {
          name: "number",
          kind: "integer",
          required: true,
          validations: [],
        },
        {
          name: "status",
          kind: "enum",
          required: false,
          enum_values: ["draft", "stable", "deprecated"],
          validations: [],
        },
      ],
      id_format: { pattern: "^section:[a-z0-9-]+$", uniqueness: "project" },
      inline_structs: [],
      is_partition_unit: true,
    },
    {
      id: "test:para",
      fields: [
        { name: "text", kind: "text", required: true, validations: [] },
      ],
      id_format: { pattern: "^para:[a-z0-9-]+$", uniqueness: "project" },
      inline_structs: [],
      is_partition_unit: false,
    },
  ],
  relation_types: [
    {
      id: "test:rel:contains",
      source_type_id: "test:section",
      target_type_id: "test:para",
      cardinality: "one-to-many",
      fields: [],
    },
  ],
  validation_rules: [],
  renderer_bindings: [],
  inline_structs: [],
};

export async function newHost(): Promise<Host> {
  // null dataDir = in-memory only; tests don't touch the disk.
  // noPlugins = true so the existing test suite is unaffected by the
  // plugin runtime; plugin tests opt in explicitly.
  const host = new Host({ dataDir: null, noPlugins: true });
  await host.load();
  await host.registerProfile(TEST_PROFILE);
  return host;
}
