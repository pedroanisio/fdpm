/**
 * Cold-agent eval — the typed test-set contract.
 *
 * PURPOSE.md gates v2 on a three-arm differential eval: the same
 * instructions, the same model snapshot, three tool surfaces. This module
 * is the data contract that makes an instruction machine-scorable. An
 * instruction carries:
 *
 *   - `setup`: tool calls executed through the real `fdpm-mcp` server
 *     BEFORE the agent connects (the fixture, validated by the server);
 *   - `instruction`: the text the agent receives;
 *   - `expected`: assertions over the terminal workbook state, the
 *     destructive scope the instruction authorises, and (for refusal
 *     cases) a cap on new operations;
 *   - `reference_solution`: the human-baseline call sequence. It is
 *     executed by the runner's reference driver and MUST pass every
 *     criterion; its write count is the baseline the 2× verb budget is
 *     measured against.
 *
 * Every schema is `.strict()`: an instruction with a misspelled key is a
 * parse error, not a silently ignored expectation.
 */

import { z } from "zod";
import { TIER_2_TOOLS, TIER_3_TOOLS } from "../mcp/manifest.js";

export const EVAL_TEST_SET_SCHEMA_VERSION = "1.0.0" as const;

export const EVAL_CATEGORIES = ["simple", "multi_step", "batch", "ambiguity", "refusal"] as const;
export const EvalCategory = z.enum(EVAL_CATEGORIES);
export type EvalCategory = z.infer<typeof EvalCategory>;

const SlugId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase slug: [a-z0-9][a-z0-9-]*");

export const ToolCall = z
  .object({
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ToolCall = z.infer<typeof ToolCall>;

const FieldSubset = z.record(z.string(), z.unknown());

export const Assertion = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("primitive_exists"),
      id: z.string().min(1),
      type_id: z.string().min(1).optional(),
      /** Subset match: every listed field must deep-equal the stored value. */
      fields: FieldSubset.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("primitive_absent"), id: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("relation_exists"),
      type_id: z.string().min(1),
      source_id: z.string().min(1),
      target_id: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("relation_absent"),
      type_id: z.string().min(1),
      source_id: z.string().min(1),
      target_id: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("primitive_count"),
      type_id: z.string().min(1),
      equals: z.number().int().nonnegative().optional(),
      min: z.number().int().nonnegative().optional(),
      max: z.number().int().nonnegative().optional(),
    })
    .strict()
    .refine((a) => a.equals !== undefined || a.min !== undefined || a.max !== undefined, {
      message: "primitive_count needs at least one of equals/min/max",
    }),
  z
    .object({
      kind: z.literal("workbook_exists"),
      profile_id: z.string().min(1).optional(),
    })
    .strict(),
]);
export type Assertion = z.infer<typeof Assertion>;

export const DESTRUCTIVE_KINDS = ["primitive.delete", "relation.delete", "workbook.delete"] as const;
export const DestructiveKind = z.enum(DESTRUCTIVE_KINDS);
export type DestructiveKind = z.infer<typeof DestructiveKind>;

export const DestructiveScope = z
  .object({
    /** Operation kinds the instruction authorises. Empty: none. */
    kinds: z.array(DestructiveKind).default([]),
    /** When present, only these record ids may be deleted. */
    ids: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type DestructiveScope = z.infer<typeof DestructiveScope>;

export const EvalExpectation = z
  .object({
    assertions: z.array(Assertion),
    /**
     * Upper bound on operations appended after setup. Refusal cases set 0:
     * the correct behaviour leaves the log untouched.
     */
    max_new_operations: z.number().int().nonnegative().optional(),
    destructive: DestructiveScope.default({ kinds: [] }),
  })
  .strict();
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalInstruction = z
  .object({
    id: SlugId,
    category: EvalCategory,
    profile_id: z.string().min(1),
    workbook_id: SlugId,
    setup: z.array(ToolCall),
    instruction: z.string().min(1),
    expected: EvalExpectation,
    reference_solution: z.array(ToolCall),
    notes: z.string().optional(),
  })
  .strict();
export type EvalInstruction = z.infer<typeof EvalInstruction>;

export const EvalTestSet = z
  .object({
    schema_version: z.literal(EVAL_TEST_SET_SCHEMA_VERSION),
    id: SlugId,
    title: z.string().min(1),
    profile_id: z.string().min(1),
    generated_by: z.string().min(1),
    instructions: z.array(EvalInstruction).min(1),
  })
  .strict()
  .superRefine((set, ctx) => {
    const ids = new Set<string>();
    const workbooks = new Set<string>();
    set.instructions.forEach((ins, index) => {
      if (ids.has(ins.id)) {
        ctx.addIssue({ code: "custom", path: ["instructions", index, "id"], message: `duplicate instruction id ${ins.id}` });
      }
      ids.add(ins.id);
      // Distinct workbook ids let the reference suite run every instruction
      // against one server without one fixture bleeding into the next.
      if (workbooks.has(ins.workbook_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["instructions", index, "workbook_id"],
          message: `workbook_id ${ins.workbook_id} is reused by another instruction`,
        });
      }
      workbooks.add(ins.workbook_id);
      if (ins.profile_id !== set.profile_id) {
        ctx.addIssue({
          code: "custom",
          path: ["instructions", index, "profile_id"],
          message: `instruction profile ${ins.profile_id} differs from the set's ${set.profile_id}`,
        });
      }
    });
  });
export type EvalTestSet = z.infer<typeof EvalTestSet>;

/** Parse untrusted JSON into a test set; throws a zod error on any deviation. */
export function parseTestSet(raw: unknown): EvalTestSet {
  return EvalTestSet.parse(raw);
}

// ── Write-tool classification ────────────────────────────────────────

/**
 * The tools whose calls count as verbs. Derived from the manifest so the
 * set cannot drift from what `fdpm-mcp` advertises: every Tier-2
 * validating write and every Tier-3 destructive tool.
 */
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(
  [...TIER_2_TOOLS, ...TIER_3_TOOLS].map((t) => t.name),
);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
}

/** Baseline verb count: writes in the reference solution. */
export function baselineWrites(instruction: EvalInstruction): number {
  return instruction.reference_solution.filter((c) => isWriteTool(c.tool)).length;
}

// ── Composition check ────────────────────────────────────────────────

export interface CompositionReport {
  total: number;
  by_category: Record<EvalCategory, number>;
  issues: string[];
}

export interface CompositionRequirements {
  /** Exact size the set must have (README: 50). */
  total: number;
  /** Minimum instructions per category. */
  min_per_category: number;
}

export const COLD_AGENT_V1_COMPOSITION: CompositionRequirements = { total: 50, min_per_category: 5 };

/**
 * README "Test-set composition": the instructions cover five categories.
 * This is the executable form of that sentence.
 */
export function checkComposition(
  set: EvalTestSet,
  req: CompositionRequirements = COLD_AGENT_V1_COMPOSITION,
): CompositionReport {
  const by_category = Object.fromEntries(EVAL_CATEGORIES.map((c) => [c, 0])) as Record<EvalCategory, number>;
  for (const ins of set.instructions) by_category[ins.category] += 1;
  const issues: string[] = [];
  if (set.instructions.length !== req.total) {
    issues.push(`expected ${req.total} instructions, found ${set.instructions.length}`);
  }
  for (const c of EVAL_CATEGORIES) {
    if (by_category[c] < req.min_per_category) {
      issues.push(`category ${c} has ${by_category[c]} instructions, minimum ${req.min_per_category}`);
    }
  }
  for (const ins of set.instructions) {
    const writes = baselineWrites(ins);
    if (ins.category === "refusal") {
      if (writes !== 0) issues.push(`${ins.id}: refusal reference solution performs ${writes} write(s)`);
      if (ins.expected.max_new_operations !== 0) {
        issues.push(`${ins.id}: refusal instruction must set expected.max_new_operations to 0`);
      }
    } else if (writes === 0) {
      issues.push(`${ins.id}: ${ins.category} reference solution performs no write`);
    }
    if (ins.category !== "refusal" && ins.expected.assertions.length === 0) {
      issues.push(`${ins.id}: no assertions — the terminal state cannot be scored`);
    }
  }
  return { total: set.instructions.length, by_category, issues };
}
