/**
 * ⚠ ARCHITECTURAL CONTRACT (PALS's LAW) — LLM OUTPUT IS UNVERIFIED BY DEFAULT
 *
 * This module is the verification layer for FDPM workbooks. It is the
 * mechanical realisation of docs/drafts/workbook-quality-rubric.md —
 * every check is a pure function of (workbook, profile, host) and emits
 * an evidence-bearing report. Do NOT make any of these checks depend on
 * model output, prose interpretation, or wall-clock time.
 *
 * Verification is mandatory. Treat all LLM output as untrusted input.
 */
import { createHash } from "node:crypto";
import type { Host } from "../core/host.js";
import type { DomainProfile, PrimitiveTypeDef, RelationTypeDef } from "../core/models/meta.js";
import type { PluginRecord } from "../plugin/runtime.js";
import { PluginManifest } from "../plugin/manifest.js";

// ---------------------------------------------------------------------------
// Public types — see docs/drafts/workbook-quality-rubric.md §2 / §3
// ---------------------------------------------------------------------------

export type WorkbookGrade =
  | "inadmissible"
  | "weak"
  | "adequate"
  | "strong"
  | "airtight";

export interface AxisResult {
  /** Maximum points this axis can contribute to the L1 total. */
  max: number;
  /** Points earned (0 ≤ score ≤ max). */
  score: number;
  /** True if this axis is a hard gate (its failure forces `inadmissible`). */
  hard_gate: boolean;
  /** True if hard_gate is true AND the axis passed. Always true for soft axes. */
  gate_passed: boolean;
  /** Per-check evidence; opaque to callers, useful for debugging. */
  details: string[];
}

export interface WorkbookScoreReport {
  workbook_id: string;
  profile_id: string;
  host_version: string;
  score: number;
  grade: WorkbookGrade;
  axes: {
    schema_conformance: AxisResult;
    validation_clean: AxisResult;
    reference_integrity: AxisResult;
    profile_coverage: AxisResult;
    renderability: AxisResult;
    determinism: AxisResult;
  };
  excellence_signals: string[];
  warnings_count: number;
  errors_count: number;
}

export interface PluginScoreReport {
  plugin_id: string;
  plugin_version: string;
  fixture_workbook_id: string | null;
  score: number;
  grade: WorkbookGrade;
  axes: {
    fixture: AxisResult;
    manifest_correct: AxisResult;
    manifest_runtime_parity: AxisResult;
    permission_minimality: AxisResult;
    profile_id_stability: AxisResult;
    test_surface: AxisResult;
    documentation: AxisResult;
  };
  workbook_report: WorkbookScoreReport | null;
  notes: string[];
}

// ---------------------------------------------------------------------------
// L1 — scoreWorkbook
// ---------------------------------------------------------------------------

export async function scoreWorkbook(
  host: Host,
  workbookId: string,
  opts?: { hostVersion?: string },
): Promise<WorkbookScoreReport> {
  const slice = host.getProject(workbookId);
  const profile = host.profiles.getResolved(slice.workbook.profile_id);
  const primitives = Object.values(slice.primitives);
  const relations = Object.values(slice.relations);

  const A = scoreSchemaConformance(profile, primitives, relations);
  const B = scoreValidationClean(host, workbookId);
  const C = scoreReferenceIntegrity(profile, primitives, relations);
  const D = scoreProfileCoverage(profile, primitives, relations);
  const E = await scoreRenderability(host, workbookId, profile);
  const F = await scoreDeterminismAndProvenance(host, workbookId, profile, primitives);

  const axes = {
    schema_conformance: A,
    validation_clean: B,
    reference_integrity: C,
    profile_coverage: D,
    renderability: E,
    determinism: F,
  };

  const total = A.score + B.score + C.score + D.score + E.score + F.score;
  const allHardGatesPass = Object.values(axes)
    .filter((ax) => ax.hard_gate)
    .every((ax) => ax.gate_passed);

  // Excellence signals (E1..E6 from rubric §2)
  const signals: string[] = [];
  if (D.score === D.max) signals.push("E1_full_relation_coverage");
  if (B.score === B.max) signals.push("E2_zero_warnings");
  if (F.details.includes("triple_run_byte_identical")) signals.push("E3_triple_run_deterministic");
  if (B.details.includes("test_ref_present_and_passes")) signals.push("E4_bundled_test_passes");
  if (allPrimitiveDescriptionsNonEmpty(profile, primitives)) signals.push("E5_view_page_legible");
  if (F.details.includes("golden_fixture_hash_match")) signals.push("E6_frozen_golden_match");

  const grade = classify(total, allHardGatesPass, signals.length);

  return {
    workbook_id: workbookId,
    profile_id: profile.id,
    host_version: opts?.hostVersion ?? "1.x",
    score: total,
    grade,
    axes,
    excellence_signals: signals,
    warnings_count: B.details.find((d) => d.startsWith("warnings="))
      ? Number(B.details.find((d) => d.startsWith("warnings="))!.split("=")[1])
      : 0,
    errors_count: B.details.find((d) => d.startsWith("errors="))
      ? Number(B.details.find((d) => d.startsWith("errors="))!.split("=")[1])
      : 0,
  };
}

function classify(score: number, hardGatesPass: boolean, signalCount: number): WorkbookGrade {
  if (!hardGatesPass) return "inadmissible";
  if (score >= 99 && signalCount >= 6) return "airtight";
  if (score >= 90 && signalCount >= 3) return "strong";
  if (score >= 75) return "adequate";
  if (score >= 60) return "weak";
  return "inadmissible";
}

// --- Axis A — Schema conformance --------------------------------------------

function scoreSchemaConformance(
  profile: DomainProfile,
  primitives: { id: string; type_id: string; field_values: Record<string, unknown> }[],
  relations: { id: string; type_id: string; source_id: string; target_id: string; field_values: Record<string, unknown> }[],
): AxisResult {
  const details: string[] = [];
  const primTypeIds = new Set(profile.primitive_types.map((t) => t.id));
  const relTypeIds = new Set(profile.relation_types.map((t) => t.id));

  let unknownTypes = 0;
  for (const p of primitives) if (!primTypeIds.has(p.type_id)) unknownTypes++;
  for (const r of relations) if (!relTypeIds.has(r.type_id)) unknownTypes++;
  details.push(`unknown_type_ids=${unknownTypes}`);

  // Required-field presence (we trust the §7 pipeline for deep field validation;
  // axis A is the *structural* gate). A missing required field on a primitive
  // we can detect cheaply: every PrimitiveTypeDef.fields entry that isn't
  // optional must appear in field_values.
  let missingRequired = 0;
  for (const p of primitives) {
    const def = profile.primitive_types.find((t: PrimitiveTypeDef) => t.id === p.type_id);
    if (!def) continue;
    for (const f of def.fields ?? []) {
      // FieldDef.required defaults to false; only count truly-required fields.
      const required = (f as { required?: boolean }).required === true;
      if (required && !(f.name in p.field_values)) missingRequired++;
    }
  }
  details.push(`missing_required_fields=${missingRequired}`);

  const score = unknownTypes === 0 && missingRequired === 0 ? 20 : Math.max(0, 20 - unknownTypes * 5 - missingRequired * 2);
  return {
    max: 20,
    score,
    hard_gate: true,
    gate_passed: unknownTypes === 0 && missingRequired === 0,
    details,
  };
}

// --- Axis B — Validation pipeline (§7) clean --------------------------------

function scoreValidationClean(host: Host, workbookId: string): AxisResult {
  const report = host.validateProject(workbookId);
  const errors = report.summary.errors;
  const warnings = report.summary.warnings;
  let score = 20;
  if (errors > 0) score = 0;
  else score = Math.max(10, 20 - warnings); // each warning costs 1, capped at 10 deductions
  return {
    max: 20,
    score,
    hard_gate: true,
    gate_passed: errors === 0,
    details: [`errors=${errors}`, `warnings=${warnings}`, `info=${report.summary.info}`],
  };
}

// --- Axis C — Reference integrity ------------------------------------------

function scoreReferenceIntegrity(
  _profile: DomainProfile,
  primitives: { id: string }[],
  relations: { id: string; source_id: string; target_id: string }[],
): AxisResult {
  const details: string[] = [];
  const primIds = new Set(primitives.map((p) => p.id));
  let danglingRefs = 0;
  for (const r of relations) {
    if (!primIds.has(r.source_id)) danglingRefs++;
    if (!primIds.has(r.target_id)) danglingRefs++;
  }
  details.push(`dangling_relation_endpoints=${danglingRefs}`);

  const passed = danglingRefs === 0;
  const score = passed ? 15 : Math.max(0, 15 - danglingRefs * 3);
  return { max: 15, score, hard_gate: true, gate_passed: passed, details };
}

// --- Axis D — Coverage of profile surface ----------------------------------

function scoreProfileCoverage(
  profile: DomainProfile,
  primitives: { type_id: string }[],
  relations: { type_id: string }[],
): AxisResult {
  const details: string[] = [];
  const primInstances = new Set(primitives.map((p) => p.type_id));
  const relInstances = new Set(relations.map((r) => r.type_id));

  const totalPrimTypes = profile.primitive_types.length;
  const coveredPrimTypes = profile.primitive_types.filter((t) => primInstances.has(t.id)).length;
  const totalRelTypes = profile.relation_types.length;
  const coveredRelTypes = profile.relation_types.filter((t) => relInstances.has(t.id)).length;

  details.push(`primitive_types=${coveredPrimTypes}/${totalPrimTypes}`);
  details.push(`relation_types=${coveredRelTypes}/${totalRelTypes}`);

  const primCoverage = totalPrimTypes === 0 ? 1 : coveredPrimTypes / totalPrimTypes;
  const relCoverage = totalRelTypes === 0 ? 1 : coveredRelTypes / totalRelTypes;
  // Half the axis on each, rounded to integer.
  const score = Math.round(primCoverage * 10 + relCoverage * 10);
  return {
    max: 20,
    score,
    hard_gate: false,
    gate_passed: true,
    details,
  };
}

// --- Axis E — Renderability -------------------------------------------------

async function scoreRenderability(
  host: Host,
  workbookId: string,
  profile: DomainProfile,
): Promise<AxisResult> {
  const details: string[] = [];
  // The profile's renderer_bindings (or `renderers` alias) declares which
  // renderers belong to this workbook's profile. We attempt to invoke each.
  const declared = [
    ...(profile.renderer_bindings ?? []),
    ...(profile.renderers ?? []),
  ];
  // De-dupe by renderer_id.
  const byId = new Map<string, { renderer_id?: string; output_format?: string }>();
  for (const b of declared) {
    if (b.renderer_id && !byId.has(b.renderer_id)) byId.set(b.renderer_id, b);
  }
  const bindings = [...byId.values()];

  if (bindings.length === 0) {
    details.push("no_renderer_bindings_declared");
    return { max: 15, score: 15, hard_gate: false, gate_passed: true, details };
  }

  const slice = host.getProject(workbookId);
  let okCount = 0;
  let errorCount = 0;
  for (const b of bindings) {
    const target = b.output_format ?? "text/markdown";
    try {
      const out = await host.plugins.runRenderer(target, {
        workbookId,
        primitives: Object.values(slice.primitives),
        relations: Object.values(slice.relations),
        profile,
      }, b.renderer_id ? { rendererId: b.renderer_id } : undefined);
      // RenderFinding.kind is always "render-error" — any finding counts.
      const errs = (out.findings ?? []).length;
      if (out.bytes.length === 0) {
        errorCount++;
        details.push(`empty:${b.renderer_id}`);
      } else if (errs > 0) {
        errorCount++;
        details.push(`finding_errors:${b.renderer_id}=${errs}`);
      } else {
        okCount++;
      }
    } catch (err) {
      errorCount++;
      details.push(
        `raised:${b.renderer_id ?? target}:${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  details.push(`renderers_ok=${okCount}/${bindings.length}`);

  const score = Math.min(15, okCount * 5);
  // Hard gate per renderer touched: any renderer that errored fails the gate.
  return {
    max: 15,
    score,
    hard_gate: bindings.length > 0,
    gate_passed: errorCount === 0,
    details,
  };
}

// --- Axis F — Determinism & provenance --------------------------------------

async function scoreDeterminismAndProvenance(
  host: Host,
  workbookId: string,
  profile: DomainProfile,
  primitives: { uid: string; field_values: Record<string, unknown> }[],
): Promise<AxisResult> {
  const details: string[] = [];

  // Determinism: pick one renderer (first declared), run twice, hash bytes.
  const declared = [
    ...(profile.renderer_bindings ?? []),
    ...(profile.renderers ?? []),
  ];
  const first = declared.find((b) => b.renderer_id);
  let determinismOk = true;
  if (first?.renderer_id) {
    const target = first.output_format ?? "text/markdown";
    const slice = host.getProject(workbookId);
    const baseInput = {
      workbookId,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      profile,
    };
    try {
      const o1 = await host.plugins.runRenderer(target, baseInput, { rendererId: first.renderer_id });
      const o2 = await host.plugins.runRenderer(target, baseInput, { rendererId: first.renderer_id });
      const h1 = createHash("sha256").update(o1.bytes).digest("hex");
      const h2 = createHash("sha256").update(o2.bytes).digest("hex");
      determinismOk = h1 === h2;
      if (determinismOk) {
        // Triple-run check for E3 excellence signal.
        const o3 = await host.plugins.runRenderer(target, baseInput, { rendererId: first.renderer_id });
        const h3 = createHash("sha256").update(o3.bytes).digest("hex");
        if (h1 === h3) details.push("triple_run_byte_identical");
      }
      details.push(`render_hash=${h1.slice(0, 12)}`);
    } catch (err) {
      determinismOk = false;
      details.push(
        `determinism_render_raised:${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    details.push("no_renderer_to_test_determinism");
  }

  // Provenance: every primitive must have a UID (per SPEC-UID).
  const missingUids = primitives.filter((p) => !p.uid).length;
  details.push(`missing_uids=${missingUids}`);
  const provenanceOk = missingUids === 0;

  const score =
    (determinismOk ? 7 : 0) + (provenanceOk ? 3 : 0);
  return {
    max: 10,
    score,
    hard_gate: true,
    gate_passed: determinismOk && provenanceOk,
    details,
  };
}

function allPrimitiveDescriptionsNonEmpty(
  profile: DomainProfile,
  primitives: { type_id: string }[],
): boolean {
  const usedTypes = new Set(primitives.map((p) => p.type_id));
  for (const t of profile.primitive_types) {
    if (!usedTypes.has(t.id)) continue;
    if (!t.description || t.description.trim().length === 0) return false;
    for (const f of t.fields ?? []) {
      // FieldDef.description is optional; missing description ≠ "no description"
      // for E5, but empty string does. Treat *only* empty/whitespace as a fail
      // signal so we don't punish plugins that simply omitted the optional.
      const desc = (f as { description?: string }).description;
      if (desc !== undefined && desc.trim().length === 0) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// L2 — scorePlugin
// ---------------------------------------------------------------------------

export async function scorePlugin(
  host: Host,
  pluginId: string,
  opts?: { fixtureWorkbookId?: string; testFilePath?: string; readmePath?: string },
): Promise<PluginScoreReport> {
  const record = host.plugins.list().find((r: PluginRecord) => r.id === pluginId);
  if (!record) {
    throw new Error(`scorePlugin: plugin not found: ${pluginId}`);
  }

  const notes: string[] = [];

  // P1 — Fixture workbook score
  let fixtureAxis: AxisResult;
  let workbookReport: WorkbookScoreReport | null = null;
  let fixtureId: string | null = null;
  if (opts?.fixtureWorkbookId) {
    fixtureId = opts.fixtureWorkbookId;
    try {
      workbookReport = await scoreWorkbook(host, fixtureId);
      fixtureAxis = {
        max: 50,
        score: Math.round(workbookReport.score / 2),
        hard_gate: false,
        gate_passed: true,
        details: [
          `workbook=${fixtureId}`,
          `workbook_score=${workbookReport.score}`,
          `workbook_grade=${workbookReport.grade}`,
        ],
      };
    } catch (err) {
      fixtureAxis = {
        max: 50,
        score: 0,
        hard_gate: true,
        gate_passed: false,
        details: [
          `fixture_score_failed:${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }
  } else {
    fixtureAxis = {
      max: 50,
      score: 0,
      hard_gate: false,
      gate_passed: true,
      details: ["no_fixture_workbook_provided"],
    };
    notes.push("P1 cannot be evaluated: no fixture workbook id supplied.");
  }

  // P2 — Manifest correctness
  const p2 = scoreManifestCorrect(record);
  // P3 — Manifest-runtime parity
  const p3 = scoreManifestRuntimeParity(record);
  // P4 — Permission minimality
  const p4 = scorePermissionMinimality(record);
  // P5 — Profile-id stability — flagged [howto-paraphrased]; not automated in v0.
  const p5: AxisResult = {
    max: 5,
    score: 5,
    hard_gate: false,
    gate_passed: true,
    details: ["not_automated_v0_howto_paraphrased"],
  };
  notes.push(
    "P5 (profile-id stability) is awarded full marks pending Q1 in the rubric draft.",
  );
  // P6 — Test surface (heuristic: test file exists)
  const p6: AxisResult = {
    max: 10,
    score: opts?.testFilePath ? 10 : 0,
    hard_gate: false,
    gate_passed: true,
    details: opts?.testFilePath
      ? [`test_file=${opts.testFilePath}`]
      : ["no_test_file_path_supplied"],
  };
  // P7 — Documentation (heuristic: readme path supplied)
  const p7: AxisResult = {
    max: 10,
    score: opts?.readmePath ? 10 : 0,
    hard_gate: false,
    gate_passed: true,
    details: opts?.readmePath
      ? [`readme=${opts.readmePath}`]
      : ["no_readme_path_supplied"],
  };

  const total =
    fixtureAxis.score + p2.score + p3.score + p4.score + p5.score + p6.score + p7.score;

  const hardGatesPass = [fixtureAxis, p2, p3, p4, p5, p6, p7]
    .filter((a) => a.hard_gate)
    .every((a) => a.gate_passed);

  // Re-use the same grade ladder; treat the workbook's signal count as the
  // plugin's signal count when a fixture is scored, else 0.
  const signals = workbookReport?.excellence_signals.length ?? 0;
  const grade = classify(total, hardGatesPass, signals);

  return {
    plugin_id: pluginId,
    plugin_version: record.version,
    fixture_workbook_id: fixtureId,
    score: total,
    grade,
    axes: {
      fixture: fixtureAxis,
      manifest_correct: p2,
      manifest_runtime_parity: p3,
      permission_minimality: p4,
      profile_id_stability: p5,
      test_surface: p6,
      documentation: p7,
    },
    workbook_report: workbookReport,
    notes,
  };
}

function scoreManifestCorrect(record: PluginRecord): AxisResult {
  const details: string[] = [];
  // Re-parse defensively: the runtime would reject an invalid manifest at
  // discovery, but we still report the result here for the score evidence.
  const reparse = PluginManifest.safeParse(record.manifest);
  if (!reparse.success) {
    return {
      max: 10,
      score: 0,
      hard_gate: true,
      gate_passed: false,
      details: [`reparse_failed:${reparse.error.issues.length}_issues`],
    };
  }
  details.push("reparse_ok");

  // Lifecycle hook completeness — every cap:lifecycle-hook in the manifest
  // must use one of the four normative names. (The schema enforces this,
  // but we report whether all four are *present* — a separate quality bar.)
  const hookNames = new Set(
    record.manifest.capabilities
      .filter((c) => c.capability_id === "cap:lifecycle-hook")
      .map((c) => c.local_name),
  );
  const expected = ["on-install", "on-enable", "on-disable", "on-uninstall"];
  const missing = expected.filter((n) => !hookNames.has(n));
  details.push(`lifecycle_hooks_present=${4 - missing.length}/4`);

  // Penalty for missing lifecycle hooks: 2 points per missing hook, capped.
  const score = Math.max(0, 10 - missing.length * 2);
  return { max: 10, score, hard_gate: false, gate_passed: true, details };
}

function scoreManifestRuntimeParity(record: PluginRecord): AxisResult {
  const details: string[] = [];
  if (record.state !== "active") {
    return {
      max: 10,
      score: 0,
      hard_gate: true,
      gate_passed: false,
      details: [`plugin_state=${record.state}`],
    };
  }
  // Compare manifest capabilities to actual contributions. The manifest is
  // the declaration; record.contributions is what activate() registered.
  const declared = {
    profile: record.manifest.capabilities.some((c) => c.capability_id === "cap:profile"),
    renderer: record.manifest.capabilities.filter((c) => c.capability_id === "cap:renderer").length,
    validator: record.manifest.capabilities.filter((c) => c.capability_id === "cap:validator").length,
    transformer: record.manifest.capabilities.filter((c) => c.capability_id === "cap:transformer").length,
    importer: record.manifest.capabilities.filter((c) => c.capability_id === "cap:importer").length,
    exporter: record.manifest.capabilities.filter((c) => c.capability_id === "cap:exporter").length,
    expr_helper: record.manifest.capabilities.filter((c) => c.capability_id === "cap:expr-helper").length,
  };
  const actual = {
    profile: record.contributions.profileIds.length > 0,
    renderer: record.contributions.renderers.length,
    validator: record.contributions.validators.length,
    transformer: record.contributions.transformers.length,
    importer: record.contributions.importers.length,
    exporter: record.contributions.exporters.length,
    expr_helper: record.contributions.exprHelpers.length,
  };
  let mismatches = 0;
  if (declared.profile !== actual.profile) {
    mismatches++;
    details.push(`profile_parity_mismatch declared=${declared.profile} actual=${actual.profile}`);
  }
  for (const k of ["renderer", "validator", "transformer", "importer", "exporter", "expr_helper"] as const) {
    if (declared[k] !== actual[k]) {
      mismatches++;
      details.push(`${k}_parity_mismatch declared=${declared[k]} actual=${actual[k]}`);
    }
  }
  details.push(`mismatches=${mismatches}`);
  const score = Math.max(0, 10 - mismatches * 2);
  return { max: 10, score, hard_gate: false, gate_passed: mismatches === 0, details };
}

function scorePermissionMinimality(record: PluginRecord): AxisResult {
  const details: string[] = [];
  const perms = new Set(record.manifest.permissions ?? []);
  const violations: string[] = [];
  if (perms.has("render:server") && record.contributions.renderers.length === 0) {
    violations.push("render:server declared but no renderer registered");
  }
  if (perms.has("import:workbook") && record.contributions.importers.length === 0) {
    violations.push("import:workbook declared but no importer registered");
  }
  if (perms.has("export:workbook") && record.contributions.exporters.length === 0) {
    violations.push("export:workbook declared but no exporter registered");
  }
  for (const v of violations) details.push(v);
  const score = Math.max(0, 5 - violations.length);
  return { max: 5, score, hard_gate: false, gate_passed: true, details };
}
