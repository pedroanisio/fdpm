/**
 * testcase:bridge-determinism + manifest parity for fdpm.document-plan.
 *
 * Same sidecar + same pinned generatedAt → byte-equal artefacts, in one
 * process and across processes (scripts/run-bridge.ts --check). This is
 * the property the CI drift gate relies on. Also pins the constants the
 * runtime drift assertions in activate() compare against, and guards the
 * one place the bridge entity diverges from the source schema
 * (SourceIdentifierFlat vs. the discriminated union).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { assembleDomainProfileFromSidecar, stableStringify } from "@fdpm/zod-bridge";
import {
  buildDocumentPlanSidecar,
  ENTITY_NAMES,
  finalizeProfile,
  PLUGIN_ID,
  PLUGIN_VERSION,
  PROFILE_ID,
  SOURCE_IDENTIFIER_KINDS,
  primitiveTypeId,
} from "../../../plugins/document_plan/sidecar.js";
import { Schemas } from "../../../plugins/document_plan/schemas/document-plan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const PLUGIN_DIR = join(REPO_ROOT, "plugins", "document_plan");
const GENERATED_AT = "1970-01-01T00:00:00.000Z";

interface Cap {
  capability_id: string;
  local_name: string;
  metadata?: { target_type_id?: string; rule_ids?: readonly string[]; renderer_id?: string };
}
interface Manifest {
  id: string;
  version: string;
  permissions: string[];
  capabilities: Cap[];
}
const manifest: Manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, "fdpm-plugin.json"), "utf8"));

describe("fdpm.document-plan — bridge determinism", () => {
  it("two same-process bridge runs produce byte-equal artefacts", () => {
    const sidecar = buildDocumentPlanSidecar();
    const a = assembleDomainProfileFromSidecar({ domain: sidecar, generatedAt: GENERATED_AT });
    const b = assembleDomainProfileFromSidecar({ domain: sidecar, generatedAt: GENERATED_AT });
    expect(stableStringify(a.profile)).toBe(stableStringify(b.profile));
    expect(stableStringify(a.viewPage)).toBe(stableStringify(b.viewPage));
    expect(stableStringify(a.productPage)).toBe(stableStringify(b.productPage));
  });

  it("re-emitting in a fresh process produces byte-equal generated/profile.json", () => {
    const onDisk = readFileSync(join(PLUGIN_DIR, "generated", "profile.json"), "utf8");
    const fresh = assembleDomainProfileFromSidecar({
      domain: buildDocumentPlanSidecar(),
      generatedAt: GENERATED_AT,
    });
    expect(stableStringify(finalizeProfile(fresh.profile)) + "\n").toBe(onDisk);
  });

  it("scripts/run-bridge.ts --check passes against the committed snapshot", () => {
    const result = execSync(`npx tsx ${join(PLUGIN_DIR, "scripts", "run-bridge.ts")} --check`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result).toContain("no drift");
  });
});

describe("fdpm.document-plan — manifest ↔ sidecar parity", () => {
  it("manifest id / version match the sidecar constants", () => {
    expect(manifest.id).toBe(PLUGIN_ID);
    expect(manifest.version).toBe(PLUGIN_VERSION);
  });

  it("schema-hash record pins the manifest version", () => {
    const hashRecord = JSON.parse(readFileSync(join(PLUGIN_DIR, "generated", "schema-hash.json"), "utf8"));
    expect(hashRecord.pinned_plugin_version).toBe(manifest.version);
    expect(hashRecord.sources).toEqual(["schemas/document-plan.ts", "sidecar.ts"]);
  });

  it("emits one primitive type and one validator per Entity, and one document renderer", () => {
    const profile = JSON.parse(readFileSync(join(PLUGIN_DIR, "generated", "profile.json"), "utf8"));
    expect(profile.id).toBe(PROFILE_ID);
    expect(profile.version).toBe("3.1.0");
    expect(profile.label).toBe("Document Plan (v3.1.0)");
    expect(profile.name).toBe("Document Plan");
    const typeIds = (profile.primitive_types as { id: string }[]).map((t) => t.id).sort();
    expect(typeIds).toEqual(ENTITY_NAMES.map(primitiveTypeId).sort());
    const validators = manifest.capabilities.filter((c) => c.capability_id === "cap:validator");
    const renderers = manifest.capabilities.filter((c) => c.capability_id === "cap:renderer");
    expect(validators.map((c) => c.metadata?.target_type_id).sort()).toEqual(typeIds);
    for (const v of validators) expect((v.metadata?.rule_ids ?? []).length).toBeGreaterThan(0);
    // One document renderer, not one field table per entity: the brief is
    // what a reader wants from a plan header.
    expect(renderers.map((c) => c.metadata?.renderer_id)).toEqual(["docplan:PlanBriefRenderer"]);
    expect(manifest.permissions).toEqual(["read:primitives", "read:relations", "read:workbooks", "render:server"]);
  });

  it("the header carries no section tree and no registries", () => {
    const profile = JSON.parse(readFileSync(join(PLUGIN_DIR, "generated", "profile.json"), "utf8"));
    const header = (profile.primitive_types as { id: string; fields: { name: string }[] }[]).find(
      (t) => t.id === "docplan:DocumentPlan",
    )!;
    const names = header.fields.map((f) => f.name);
    for (const absent of ["structure", "threads", "people"]) expect(names).not.toContain(absent);
    expect(names).toEqual(expect.arrayContaining(["id", "schema_version", "work_type", "title", "thesis", "content", "metadata"]));
  });

  it("SourceIdentifierFlat kinds equal the source discriminated union's arms", () => {
    const arms = (Schemas.SourceIdentifier as unknown as { options: { shape: { kind: { value: string } } }[] }).options.map(
      (o) => o.shape.kind.value,
    );
    expect([...SOURCE_IDENTIFIER_KINDS].sort()).toEqual([...arms].sort());
  });
});
