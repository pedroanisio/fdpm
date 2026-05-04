/**
 * Validator registrations for the 24 ValidationRuleDef entries declared
 * in `validation_rules.ts`. Each registers a `cap:validator` whose
 * function evaluates the rule's predicate and emits one finding (at the
 * rule's declared level) when the predicate fails.
 *
 * The pipeline suppresses the step-5 "info: predicate not evaluated"
 * emission for rules covered here, so each logical check produces one
 * finding at the rule's declared level — never one info + one error.
 *
 * Once the host CEL runtime ships (SPEC-CEL-VALIDATOR), this file is
 * deleted; predicate strings in validation_rules.ts become the executable
 * spec.
 */
import type { PluginContext } from "../../src/plugin/types.js";
import type {
  PrimitiveInstance,
  RelationInstance,
  ValidationFinding,
} from "../../src/core/models/instance.js";
import {
  checkMinItems,
  checkNonTrivial,
  fieldEquals,
  hasIncoming,
  hasOutgoing,
  isTrivial,
} from "./_validators.js";

/** Adapter that runs against either primitive or relation instances. */
function anyInst(
  fn: (
    inst: PrimitiveInstance | RelationInstance,
    rels: readonly RelationInstance[],
  ) => ValidationFinding[],
) {
  return (
    instance: PrimitiveInstance | RelationInstance,
    _type: unknown,
    _profile: unknown,
    context?: { relations: readonly RelationInstance[] },
  ): ValidationFinding[] => fn(instance, context?.relations ?? []);
}

export function registerSpecAuthoringValidators(ctx: PluginContext): void {
  // ── Document-level ────────────────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:Document",
    rule_id: "spec:val:document-has-status",
    fn: anyInst((inst) => {
      const out: ValidationFinding[] = [];
      for (const f of ["status", "spec_id", "version"]) {
        out.push(
          ...checkNonTrivial(inst, f, {
            ruleId: "spec:val:document-has-status",
            level: "error",
            message: `Document requires non_trivial(${f}) (§0 Document Status).`,
          }),
        );
      }
      return out;
    }),
  });

  ctx.registerValidator({
    type_id: "spec:Document",
    rule_id: "spec:val:document-has-disclaimer",
    fn: anyInst((inst) =>
      checkNonTrivial(inst, "disclaimer_path", {
        ruleId: "spec:val:document-has-disclaimer",
        level: "error",
        message: "Document requires non_trivial(disclaimer_path) — CLAUDE.md mandates it.",
      }),
    ),
  });

  ctx.registerValidator({
    type_id: "spec:Document",
    rule_id: "spec:val:document-has-required-reads",
    fn: anyInst((inst) =>
      checkMinItems(inst, "required_reads", 1, {
        ruleId: "spec:val:document-has-required-reads",
        level: "warning",
        message: "Document should declare ≥ 1 required_read (e.g., CLAUDE.md, PURPOSE.md).",
      }),
    ),
  });

  ctx.registerValidator({
    type_id: "spec:Document",
    rule_id: "spec:val:document-has-revision",
    fn: anyInst((inst, rels) => {
      // RevisedIn is `<thing> --RevisedIn--> <Revision>`, so a Document
      // that has been revised has outgoing RevisedIn edges (NOT incoming
      // — the Revision is the target). The earlier draft of this rule
      // wrote `has_incoming(spec:RevisedIn)` which never fires for the
      // Document and is the kind of subtle mis-direction CLAUDE.md's
      // PALS-LAW posture exists to catch.
      const hasSec = hasOutgoing(inst, rels, "spec:HasSection");
      const hasRev = hasOutgoing(inst, rels, "spec:RevisedIn");
      if (hasSec && hasRev) return [];
      return [
        {
          rule_id: "spec:val:document-has-revision",
          level: "warning",
          target_id: inst.id,
          field_path: null,
          message:
            "Document should declare ≥ 1 spec:RevisedIn edge to a spec:Revision (and ≥ 1 spec:HasSection child).",
        },
      ];
    }),
  });

  // ── Section ──────────────────────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:Section",
    rule_id: "spec:val:section-has-body",
    fn: anyInst((inst) => {
      const body = inst.field_values["body_md"];
      const kind = inst.field_values["kind"];
      if (!isTrivial(body) || !isTrivial(kind)) return [];
      return [
        {
          rule_id: "spec:val:section-has-body",
          level: "error",
          target_id: inst.id,
          field_path: "field_values.body_md",
          message:
            "Section must provide non_trivial(body_md) or declare a kind that drives auto-inclusion.",
        },
      ];
    }),
  });

  // ── ADR / decision graph ─────────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:ADR",
    rule_id: "spec:val:adr-has-options",
    fn: anyInst((inst, rels) => {
      // Tightened from "has_outgoing" to "≥ 2 spec:Considers edges" so
      // the rule actually enforces the Nygard 2-options bar (the legacy
      // DSL didn't have a clean way to spell ≥ N edges).
      const considered = rels.filter(
        (r) => r.type_id === "spec:Considers" && r.source_id === inst.id,
      );
      if (considered.length >= 2) return [];
      return [
        {
          rule_id: "spec:val:adr-has-options",
          level: "warning",
          target_id: inst.id,
          field_path: null,
          message: `ADR must consider ≥ 2 options via spec:Considers (found ${considered.length}).`,
        },
      ];
    }),
  });

  ctx.registerValidator({
    type_id: "spec:ADR",
    rule_id: "spec:val:adr-has-chosen",
    fn: anyInst((inst, rels) => {
      const chose = rels.filter(
        (r) => r.type_id === "spec:Chose" && r.source_id === inst.id,
      );
      if (chose.length === 1) return [];
      return [
        {
          rule_id: "spec:val:adr-has-chosen",
          level: "warning",
          target_id: inst.id,
          field_path: null,
          message: `ADR must point to exactly one chosen option via spec:Chose (found ${chose.length}).`,
        },
      ];
    }),
  });

  ctx.registerValidator({
    type_id: "spec:ADR",
    rule_id: "spec:val:adr-has-context",
    fn: anyInst((inst) =>
      checkNonTrivial(inst, "context", {
        ruleId: "spec:val:adr-has-context",
        level: "error",
        message: "ADR Context section is mandatory (non_trivial(context)).",
      }),
    ),
  });

  ctx.registerValidator({
    type_id: "spec:ADR",
    rule_id: "spec:val:adr-has-consequences",
    fn: anyInst((inst) =>
      checkMinItems(inst, "consequences", 1, {
        ruleId: "spec:val:adr-has-consequences",
        level: "error",
        message: "ADR must list ≥ 1 consequence (positive, negative, or neutral).",
      }),
    ),
  });

  ctx.registerValidator({
    type_id: "spec:Option",
    rule_id: "spec:val:option-rejection-reason",
    fn: anyInst((inst) => {
      if (!fieldEquals(inst, "verdict", "rejected")) return [];
      if (!isTrivial(inst.field_values["rejection_reason"])) return [];
      return [
        {
          rule_id: "spec:val:option-rejection-reason",
          level: "error",
          target_id: inst.id,
          field_path: "field_values.rejection_reason",
          message:
            "Rejected options must populate rejection_reason — an unaccountable rejection violates CLAUDE.md rule 1.",
        },
      ];
    }),
  });

  // ── Quality-attribute scenarios ──────────────────────────────

  ctx.registerValidator({
    type_id: "spec:QAScenario",
    rule_id: "spec:val:qas-six-fields",
    fn: anyInst((inst) => {
      const findings: ValidationFinding[] = [];
      const fields = [
        "source",
        "stimulus",
        "environment",
        "artifact",
        "response",
        "response_measure",
      ];
      for (const f of fields) {
        findings.push(
          ...checkNonTrivial(inst, f, {
            ruleId: "spec:val:qas-six-fields",
            level: "error",
            message: `QAScenario field ${f} is required (SEI 6-field discipline).`,
          }),
        );
      }
      return findings;
    }),
  });

  ctx.registerValidator({
    type_id: "spec:QAScenario",
    rule_id: "spec:val:qas-targets-attribute",
    fn: anyInst((inst, rels) => {
      if (hasOutgoing(inst, rels, "spec:Targets")) return [];
      return [
        {
          rule_id: "spec:val:qas-targets-attribute",
          level: "warning",
          target_id: inst.id,
          field_path: null,
          message:
            "QAScenario should target a spec:QualityAttribute via spec:Targets — orphan scenarios are floating tests.",
        },
      ];
    }),
  });

  // ── Requirements / verifiability ─────────────────────────────

  ctx.registerValidator({
    type_id: "spec:Requirement",
    rule_id: "spec:val:requirement-has-verifier",
    fn: anyInst((inst) => {
      // unverifiable is allowed iff explicit; otherwise verifier_ref required.
      if (fieldEquals(inst, "verifiability", "unverifiable")) return [];
      if (!isTrivial(inst.field_values["verifier_ref"])) return [];
      return [
        {
          rule_id: "spec:val:requirement-has-verifier",
          level: "warning",
          target_id: inst.id,
          field_path: "field_values.verifier_ref",
          message:
            "Verifiable requirement should declare a verifier_ref (test, CI check, or audit procedure).",
        },
      ];
    }),
  });

  ctx.registerValidator({
    type_id: "spec:Requirement",
    rule_id: "spec:val:must-not-unverifiable",
    fn: anyInst((inst) => {
      if (!fieldEquals(inst, "strength", "MUST")) return [];
      if (!fieldEquals(inst, "verifiability", "unverifiable")) return [];
      return [
        {
          rule_id: "spec:val:must-not-unverifiable",
          level: "error",
          target_id: inst.id,
          field_path: "field_values.verifiability",
          message:
            "MUST + unverifiable is unenforceable. Downgrade to SHOULD or make it verifiable.",
        },
      ];
    }),
  });

  ctx.registerValidator({
    type_id: "spec:AcceptanceCriterion",
    rule_id: "spec:val:acceptance-criterion-has-evidence",
    fn: anyInst((inst) => {
      if (!fieldEquals(inst, "status", "met")) return [];
      const evidence = inst.field_values["evidence_refs"];
      if (Array.isArray(evidence) && evidence.length >= 1) return [];
      return [
        {
          rule_id: "spec:val:acceptance-criterion-has-evidence",
          level: "error",
          target_id: inst.id,
          field_path: "field_values.evidence_refs",
          message: "Acceptance criterion marked 'met' must cite ≥ 1 evidence_ref.",
        },
      ];
    }),
  });

  // ── Risk ─────────────────────────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:Risk",
    rule_id: "spec:val:risk-has-mitigation",
    fn: anyInst((inst, rels) => {
      if (hasIncoming(inst, rels, "spec:Mitigates")) return [];
      return [
        {
          rule_id: "spec:val:risk-has-mitigation",
          level: "warning",
          target_id: inst.id,
          field_path: null,
          message:
            "Risk should have ≥ 1 spec:Mitigation linked via spec:Mitigates, or be promoted to an OpenQuestion.",
        },
      ];
    }),
  });

  // ── Open questions ───────────────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:OpenQuestion",
    rule_id: "spec:val:open-question-has-default",
    fn: anyInst((inst) =>
      checkNonTrivial(inst, "default_choice", {
        ruleId: "spec:val:open-question-has-default",
        level: "warning",
        message:
          "Per SPEC-MCP §18, open questions should declare a default_choice and rationale.",
      }),
    ),
  });

  // ── PALS-LAW: references ─────────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:Reference",
    rule_id: "spec:val:reference-has-verification",
    fn: anyInst((inst) =>
      checkNonTrivial(inst, "verification", {
        ruleId: "spec:val:reference-has-verification",
        level: "error",
        message:
          "PALS-LAW: every Reference must declare a verification posture (verified|unverified|self_evident|cannot_verify).",
      }),
    ),
  });

  ctx.registerValidator({
    type_id: "spec:Reference",
    rule_id: "spec:val:reference-unverified-needs-note",
    fn: anyInst((inst) => {
      const v = inst.field_values["verification"];
      if (v === "verified" || v === "self_evident") return [];
      if (!isTrivial(inst.field_values["verification_note"])) return [];
      return [
        {
          rule_id: "spec:val:reference-unverified-needs-note",
          level: "error",
          target_id: inst.id,
          field_path: "field_values.verification_note",
          message:
            "Unverified or cannot-verify references must include verification_note (CLAUDE.md rule 2: never hallucinate references).",
        },
      ];
    }),
  });

  // ── Trade-off ────────────────────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:TradeoffAxis",
    rule_id: "spec:val:tradeoff-has-cells",
    fn: anyInst((inst) =>
      checkMinItems(inst, "cells", 1, {
        ruleId: "spec:val:tradeoff-has-cells",
        level: "error",
        message: "Trade-off axis must contain ≥ 1 cell.",
      }),
    ),
  });

  // ── Capability / Tool surface ────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:Tool",
    rule_id: "spec:val:tool-has-schemas",
    fn: anyInst((inst) => {
      if (fieldEquals(inst, "tier", "read_only")) return [];
      const i = inst.field_values["input_schema_ref"];
      const o = inst.field_values["output_schema_ref"];
      if (!isTrivial(i) && !isTrivial(o)) return [];
      return [
        {
          rule_id: "spec:val:tool-has-schemas",
          level: "error",
          target_id: inst.id,
          field_path: null,
          message:
            "Validating-write / destructive tools must declare input_schema_ref and output_schema_ref (SPEC-MCP §8.1).",
        },
      ];
    }),
  });

  ctx.registerValidator({
    type_id: "spec:Tool",
    rule_id: "spec:val:destructive-default-off",
    fn: anyInst((inst) => {
      if (!fieldEquals(inst, "tier", "destructive")) return [];
      if (!fieldEquals(inst, "exposure", "always")) return [];
      return [
        {
          rule_id: "spec:val:destructive-default-off",
          level: "warning",
          target_id: inst.id,
          field_path: "field_values.exposure",
          message:
            "Destructive tools should default to opt_in (SPEC-MCP §5.3). exposure=always is a regression.",
        },
      ];
    }),
  });

  // ── Configuration / Migration ────────────────────────────────

  ctx.registerValidator({
    type_id: "spec:ConfigEntry",
    rule_id: "spec:val:config-has-purpose",
    fn: anyInst((inst) =>
      checkNonTrivial(inst, "purpose", {
        ruleId: "spec:val:config-has-purpose",
        level: "error",
        message: "ConfigEntry requires a purpose (SPEC-CORE §15).",
      }),
    ),
  });

  ctx.registerValidator({
    type_id: "spec:MigrationStep",
    rule_id: "spec:val:migration-has-action",
    fn: anyInst((inst) =>
      checkNonTrivial(inst, "action", {
        ruleId: "spec:val:migration-has-action",
        level: "error",
        message: "MigrationStep requires non_trivial(action).",
      }),
    ),
  });
}
