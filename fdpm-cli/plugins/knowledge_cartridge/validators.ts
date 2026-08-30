/**
 * Pass 6, executed rather than recited.
 *
 * GENERATOR.md's verification pass is eleven checks under one instruction:
 * *"Mechanical checks only. No self-assessment — a model asked whether its
 * output is good will say yes… Run them as operations, not as judgements."*
 * In the document they are a markdown checklist a model is asked to honour.
 * Here they are writes the host rejects.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * That banner is not decoration on this file. A cartridge is assembled
 * wholesale from model output, and Pass 4 names the specific failure: faced
 * with a hole, a model "will reach for training-data knowledge and produce a
 * confident uncited claim sitting in a document whose every other claim is
 * cited". `kc:val:normative-claim-cited` is the control for exactly that, and
 * `tests/plugins/knowledge_cartridge/validators.test.ts` feeds it the uncited
 * case and asserts the rejection.
 *
 * Two checks are NOT enforceable here and are declared in
 * `KC_UNENFORCEABLE_CHECKS` rather than quietly dropped. A validator is a pure
 * function of an instance and the workbook's relations; resolving an ordinal
 * against a live corpus is a network call. An unenforceable check nobody
 * declared is indistinguishable from one that passed.
 */
import type { ValidationFinding } from "../../src/core/models/instance.js";
import type { PrimitiveInstance, RelationInstance } from "../../src/core/models/instance.js";
import type { ValidatorFn, ValidatorRegistration } from "../../src/plugin/types.js";
import { R, T } from "./ids.js";
import { NORMATIVE_TYPE_IDS } from "./primitives.js";

export const RULE = {
  claimCited: "kc:val:normative-claim-cited",
  harvestArm: "kc:val:harvest-retention-arm",
  orphanOverride: "kc:val:override-suspends-a-rule",
  diagnosticMinimum: "kc:val:diagnostic-minimum",
  judgementPresent: "kc:val:judgement-non-empty",
  exclusionsPresent: "kc:val:exclusions-non-empty",
  discardRate: "kc:val:discard-rate",
  falsifierPresent: "kc:val:invariant-falsifiable",
  stepOrdering: "kc:val:step-constrains-next",
} as const;

/**
 * Pass-6 checks this layer cannot perform, with the reason. Surfaced by the
 * citation-index renderer so a reader of the artifact knows which parts of the
 * checklist a clean validation run did and did not cover.
 */
export const KC_UNENFORCEABLE_CHECKS: ReadonlyArray<{ check: string; why: string }> = [
  {
    check: "Every ordinal resolves to a real sentence in a real document",
    why: "A validator is a pure function of the instance and the workbook's relations. Resolving an ordinal means calling the retrieval substrate, which the host does not do at write time. Verify out of band against the corpus named on kc:Source.document_id.",
  },
  {
    check: "Compression ratio <= 5% of source tokens",
    why: "The numerator is the rendered artifact, which does not exist until after validation. kc:Cartridge.source_token_estimate stores the denominator; compute the ratio at render time from the emitted bytes.",
  },
  {
    check: "No verbatim quotation beyond short attributed phrases",
    why: "A length heuristic over kc:Harvest.verbatim would flag legitimate ranged reads, which are stored verbatim on purpose. This is a human review step.",
  },
];

const NORMATIVE = new Set<string>(NORMATIVE_TYPE_IDS);

function finding(
  ruleId: string,
  targetId: string,
  message: string,
  opts?: { level?: ValidationFinding["level"]; fieldPath?: string; evidence?: Record<string, unknown> },
): ValidationFinding {
  return {
    level: opts?.level ?? "error",
    rule_id: ruleId,
    target_id: targetId,
    field_path: opts?.fieldPath ?? null,
    message,
    evidence: opts?.evidence ?? null,
  };
}

function isPrimitive(i: PrimitiveInstance | RelationInstance): i is PrimitiveInstance {
  return !("source_id" in i);
}

function relationsOf(
  context: { relations: readonly RelationInstance[] } | undefined,
): readonly RelationInstance[] {
  return context?.relations ?? [];
}

// ── The gap-filling control ──────────────────────────────────────────

/**
 * Every normative claim carries a KEY:ordinal — checked over the finished
 * cartridge, not at the moment each claim is written.
 *
 * This is a Pass-6 check and it is enforced where Pass 6 runs: on the
 * `kc:Cartridge` header, which Pass 5 creates last. It CANNOT be a per-write
 * check on the layer types themselves. A citation is a `kc:CitesSource` edge,
 * an edge needs both endpoints to exist, and the host validates each write
 * against the proposed post-state — so a layer type that required an inbound
 * citation at creation time could never be created at all, in a batch or
 * otherwise. Gating the header instead means the header cannot be written
 * while an uncited claim exists, which is the same guarantee at the only
 * point in the sequence where it is satisfiable.
 *
 * Applied to L0–L4. L5 is exempt: an override is a practitioner's condition
 * for setting a rule aside, not a claim the corpus is asked to support, and
 * GENERATOR.md puts it outside the executable layers on purpose.
 */
export function uncitedClaims(
  primitives: readonly PrimitiveInstance[],
  relations: readonly RelationInstance[],
): PrimitiveInstance[] {
  const cited = new Set(
    relations.filter((r) => r.type_id === R.CitesSource).map((r) => r.source_id),
  );
  return primitives
    .filter((p) => NORMATIVE.has(p.type_id) && !cited.has(p.id))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ── The harvest arm ──────────────────────────────────────────────────

/** `retained` and `discard_reason` are two arms of one decision. */
export const validateHarvestArm: ValidatorFn = (instance) => {
  if (!isPrimitive(instance) || instance.type_id !== T.Harvest) return [];
  const retained = instance.field_values["retained"];
  const reason = instance.field_values["discard_reason"];
  const hasReason = typeof reason === "string" && reason.trim().length > 0;
  if (retained === false && !hasReason) {
    return [
      finding(
        RULE.harvestArm,
        instance.id,
        "A discarded harvest row must record why it failed the transposition test. Without it the discard rate is a number nobody can audit.",
        { fieldPath: "field_values.discard_reason" },
      ),
    ];
  }
  if (retained === true && hasReason) {
    return [
      finding(
        RULE.harvestArm,
        instance.id,
        "A retained harvest row carries no discard_reason. It was kept; there is nothing to explain.",
        { fieldPath: "field_values.discard_reason" },
      ),
    ];
  }
  return [];
};

// ── L5 must suspend something ────────────────────────────────────────

export const validateOverrideTarget: ValidatorFn = (instance, _type, _profile, context) => {
  if (!isPrimitive(instance) || instance.type_id !== T.Override) return [];
  const edges = relationsOf(context).filter(
    (r) => r.type_id === R.OverridesInvariant && r.source_id === instance.id,
  );
  if (edges.length > 0) return [];
  return [
    finding(
      RULE.orphanOverride,
      instance.id,
      "An override that suspends no kc:Invariant is an opinion. Add a kc:OverridesInvariant edge to the rule it sets aside.",
      { level: "warning", evidence: { required_relation: R.OverridesInvariant } },
    ),
  ];
};

// ── Falsifiability and ordering, the two layer-shape guards ──────────

export const validateFalsifier: ValidatorFn = (instance) => {
  if (!isPrimitive(instance) || instance.type_id !== T.Invariant) return [];
  const f = instance.field_values["falsifier"];
  if (typeof f === "string" && f.trim().length >= 8) return [];
  return [
    finding(
      RULE.falsifierPresent,
      instance.id,
      "An invariant needs a concrete instance that would violate it. A constraint you cannot point at and falsify is a theme, not a constraint.",
      { fieldPath: "field_values.falsifier" },
    ),
  ];
};

export const validateStepOrdering: ValidatorFn = (instance) => {
  if (!isPrimitive(instance) || instance.type_id !== T.Step) return [];
  const c = instance.field_values["constrains_next"];
  if (typeof c === "string" && c.trim().length >= 8) return [];
  return [
    finding(
      RULE.stepOrdering,
      instance.id,
      "In L3 the ordering IS the content: state why this step must precede the next. A step that constrains nothing is a list item.",
      { fieldPath: "field_values.constrains_next" },
    ),
  ];
};

// ── Whole-cartridge counts, hung off kc:Cartridge ────────────────────

/**
 * The four Pass-6 counting checks. They are workbook-wide facts, so they are
 * registered against `kc:Cartridge` — the one primitive a workbook holds
 * exactly one of — and read the rest of the graph through the pipeline's
 * validation context.
 *
 * They emit at WARNING. A cartridge mid-construction legitimately has three
 * diagnostics and no judgement layer; making these errors would block every
 * write until the artifact was finished, which would make the profile unusable
 * for the thing it exists to host. `fdpm validate --min-level warning` and the
 * citation-index renderer are where they land.
 */
export function cartridgeCountFindings(
  cartridgeId: string,
  primitives: readonly PrimitiveInstance[],
  relations: readonly RelationInstance[],
): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  const byType = (id: string): PrimitiveInstance[] => primitives.filter((p) => p.type_id === id);

  // The gap-filling control. Error level: a cartridge header must not be
  // written over a graph that still holds an uncited normative claim.
  const uncited = uncitedClaims(primitives, relations);
  if (uncited.length > 0) {
    out.push(
      finding(
        RULE.claimCited,
        cartridgeId,
        `${uncited.length} normative claim(s) carry no kc:CitesSource edge: ${uncited
          .map((u) => u.id)
          .join(", ")}. Every such claim carries a KEY:ordinal or it is deleted — an uncited claim in a cited document is the gap-filling failure, not a rounding error.`,
        { evidence: { uncited: uncited.map((u) => u.id), required_relation: R.CitesSource } },
      ),
    );
  }

  const diagnostics = byType(T.Diagnostic).length;
  if (diagnostics < 8) {
    out.push(
      finding(
        RULE.diagnosticMinimum,
        cartridgeId,
        `L4 holds ${diagnostics} diagnostics; a craft with fewer than 8 known failure modes has been under-harvested.`,
        { level: "warning", evidence: { diagnostics, minimum: 8 } },
      ),
    );
  }

  if (byType(T.Override).length === 0) {
    out.push(
      finding(
        RULE.judgementPresent,
        cartridgeId,
        "L5 is empty. A cartridge with no judgement layer has encoded no adaptive expertise — it is a textbook, not a practitioner.",
        { level: "warning" },
      ),
    );
  }

  const exclusions = byType(T.EnvelopeItem).filter(
    (p) => p.field_values["disposition"] === "excluded",
  ).length;
  if (exclusions === 0) {
    out.push(
      finding(
        RULE.exclusionsPresent,
        cartridgeId,
        "The competence envelope excludes nothing. An envelope drawn to match whatever the corpus contained makes the gap audit vacuous; name at least two things a reasonable person would expect to be included.",
        { level: "warning" },
      ),
    );
  }

  const harvest = byType(T.Harvest);
  if (harvest.length > 0) {
    const discarded = harvest.filter((p) => p.field_values["retained"] === false).length;
    const rate = discarded / harvest.length;
    if (rate < 0.5) {
      out.push(
        finding(
          RULE.discardRate,
          cartridgeId,
          `Discard rate is ${(rate * 100).toFixed(0)}% (${discarded} of ${harvest.length}). Below 50% the transposition pass has failed — prose is being reformatted as prose under a new name.`,
          { level: "warning", evidence: { discarded, harvested: harvest.length, rate } },
        ),
      );
    }
  }

  return out;
}

export const validateCartridgeCounts: ValidatorFn = (instance, _type, _profile, context) => {
  if (!isPrimitive(instance) || instance.type_id !== T.Cartridge) return [];
  // `ValidatorContext` declares only `relations`, but the host also passes the
  // workbook slice (src/core/host.ts validationContext). Reading it through a
  // cast is the established idiom for cross-primitive invariants — see
  // acme_business_deck, acme_pitch_deck and document_plan_dnis, and the
  // limitation documented in plugins/style/sidecar.ts. When the slice is
  // absent (a workbook mid-creation) the counts are simply not computed.
  const wb = (context as { workbook?: { primitives?: Record<string, PrimitiveInstance> } } | undefined)
    ?.workbook;
  if (!wb?.primitives) return [];
  return cartridgeCountFindings(
    instance.id,
    Object.values(wb.primitives),
    relationsOf(context),
  );
};

export const KC_VALIDATORS: ValidatorRegistration[] = [
  { type_id: T.Harvest, rule_id: RULE.harvestArm, fn: validateHarvestArm },
  { type_id: T.Override, rule_id: RULE.orphanOverride, fn: validateOverrideTarget },
  { type_id: T.Invariant, rule_id: RULE.falsifierPresent, fn: validateFalsifier },
  { type_id: T.Step, rule_id: RULE.stepOrdering, fn: validateStepOrdering },
  { type_id: T.Cartridge, rule_id: RULE.claimCited, fn: validateCartridgeCounts },
];
