/**
 * One store, built to exercise every branch the Family A renderers have
 * to draw. It is a real document — it parses against the vendored v2
 * contract, and the tests assert that first, because a fixture that does
 * not parse would prove nothing about renderers that only ever see
 * parsed input.
 *
 * What is deliberately in it:
 *
 *   - three stages, so the forward-DAG edge (stage 3 reads stage 1) is a
 *     real edge and not a self-loop;
 *   - all four binding source kinds — literal, pipeline_input,
 *     stage_output, carried;
 *   - two carries, one `replace` and one `append`, so the back edge and
 *     the append-mode context growth both appear;
 *   - three stop-condition kinds including `unchanged`, whose window
 *     spans two observed stages;
 *   - a `markdown` stage with ZERO validators, which is the unguarded
 *     consumer A2 exists to flag;
 *   - two agents whose tool grants span read / write / destructive, so
 *     A3's authority matrix has something to say;
 *   - a budget of 8 model calls against a structural bound of 12, so A5
 *     reports a pipeline that can only ever end exhausted.
 */
import {
  parseLoopForwardStore,
  type LoopForwardStore,
} from "../../../plugins/loop_forward/schemas/loop-forward.js";

const AT = "2026-08-29T12:00:00Z";

const ID = {
  store: "00000000-0000-4000-8000-000000000001",
  systemTemplate: "00000000-0000-4000-8000-000000000002",
  draftTemplate: "00000000-0000-4000-8000-000000000003",
  reviewTemplate: "00000000-0000-4000-8000-000000000004",
  reviseTemplate: "00000000-0000-4000-8000-000000000005",
  writerAgent: "00000000-0000-4000-8000-000000000006",
  criticAgent: "00000000-0000-4000-8000-000000000007",
  pipeline: "00000000-0000-4000-8000-000000000008",
  draftStage: "00000000-0000-4000-8000-000000000009",
  reviewStage: "00000000-0000-4000-8000-00000000000a",
  reviseStage: "00000000-0000-4000-8000-00000000000b",
} as const;

export const FIXTURE_IDS = ID;

function lifecycle(id: string, name: string, description: string) {
  return {
    schema_version: "2.0.0" as const,
    id,
    name,
    version: "1.0.0",
    status: "draft" as const,
    description,
    tags: [] as string[],
    governance: { owner: "loop-team", review_every_days: 30 },
    provenance: { created_by: "loop-team", created_at: AT },
    changelog: [
      {
        version: "1.0.0",
        at: AT,
        author: "loop-team",
        summary: "Initial version.",
        change_type: "initial" as const,
      },
    ],
  };
}

const draftSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  properties: {
    draft: { type: "string", minLength: 1 },
    word_count: { type: "integer", minimum: 1 },
  },
  required: ["draft", "word_count"],
};

const reviewSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "number", minimum: 0, maximum: 1 },
    verdict: { type: "string" },
    accepted: { type: "boolean" },
  },
  required: ["score", "verdict", "accepted"],
};

/** The raw document, before parsing. */
export function rawStore(): unknown {
  return {
    entity_kind: "loop_forward_store",
    schema_version: "2.0.0",
    id: ID.store,
    revision: 1,
    provenance: { created_by: "loop-team", created_at: AT },
    prompt_templates: [
      {
        entity_kind: "prompt_template",
        ...lifecycle(ID.systemTemplate, "house-system", "Shared system instructions."),
        locale: "en-US",
        messages: [{ role: "system", content: "Write plainly and cite nothing you cannot check." }],
        variables: [],
        content_sensitivity: "internal",
      },
      {
        entity_kind: "prompt_template",
        ...lifecycle(ID.draftTemplate, "draft-task", "Produce a first draft."),
        locale: "en-US",
        messages: [
          { role: "user", content: "Write about {{topic}} in at most {{max_words}} words." },
        ],
        variables: [
          { name: "topic", type: "string", description: "Subject to write about.", is_required: true },
          {
            name: "max_words",
            type: "integer",
            description: "Upper bound on length.",
            is_required: true,
          },
        ],
        content_sensitivity: "internal",
      },
      {
        entity_kind: "prompt_template",
        ...lifecycle(ID.reviewTemplate, "review-task", "Score a draft."),
        locale: "en-US",
        messages: [{ role: "user", content: "Score this draft: {{draft}}" }],
        variables: [
          { name: "draft", type: "string", description: "Draft to score.", is_required: true },
        ],
        content_sensitivity: "internal",
      },
      {
        entity_kind: "prompt_template",
        ...lifecycle(ID.reviseTemplate, "revise-task", "Revise using the critique."),
        locale: "en-US",
        messages: [
          {
            role: "user",
            content: "Revise {{draft}} using {{critique}}. History so far: {{history}}",
          },
        ],
        variables: [
          { name: "draft", type: "string", description: "Draft to revise.", is_required: true },
          { name: "critique", type: "string", description: "Reviewer verdict.", is_required: true },
          {
            name: "history",
            type: "string",
            description: "Accumulated revision history.",
            is_required: true,
          },
        ],
        content_sensitivity: "internal",
      },
    ],
    agents: [
      {
        entity_kind: "agent_definition",
        ...lifecycle(ID.writerAgent, "writer-agent", "Drafts and revises prose."),
        system_prompt_template_id: ID.systemTemplate,
        model: {
          provider: "anthropic",
          model_id: "claude-sonnet-5",
          sampling: { kind: "temperature", value: 0.7 },
          max_output_tokens: 4_000,
        },
        tool_policy: [
          { tool_name: "document.read", authority: "read", approval: "none" },
          { tool_name: "document.write", authority: "write", approval: "per_run" },
          { tool_name: "document.delete", authority: "destructive", approval: "per_action" },
        ],
      },
      {
        entity_kind: "agent_definition",
        ...lifecycle(ID.criticAgent, "critic-agent", "Scores drafts against the brief."),
        system_prompt_template_id: ID.systemTemplate,
        model: {
          provider: "anthropic",
          model_id: "claude-opus-5",
          sampling: { kind: "deterministic", seed: 11 },
          max_output_tokens: 2_000,
        },
        tool_policy: [{ tool_name: "document.read", authority: "read", approval: "none" }],
      },
    ],
    pipelines: [
      {
        entity_kind: "loop_forward_pipeline",
        ...lifecycle(ID.pipeline, "draft-review-loop", "Draft, score, revise until accepted."),
        inputs: [
          { name: "topic", type: "string", description: "Subject to write about.", is_required: true },
          {
            name: "max_words",
            type: "integer",
            description: "Upper bound on length.",
            is_required: true,
          },
        ],
        stages: [
          {
            id: ID.draftStage,
            name: "draft",
            agent_id: ID.writerAgent,
            task_prompt_template_id: ID.draftTemplate,
            bindings: [
              { variable_name: "topic", source: { kind: "pipeline_input", input_name: "topic" } },
              {
                variable_name: "max_words",
                source: { kind: "pipeline_input", input_name: "max_words" },
              },
            ],
            output: {
              format: "json",
              json_schema: draftSchema,
              validators: [{ kind: "range", path: "/word_count", min: 1, max: 2_000 }],
              on_invalid: { action: "retry", max_attempts: 2, feedback: "Emit the declared shape." },
            },
            timeout_ms: 60_000,
          },
          {
            id: ID.reviewStage,
            name: "review",
            agent_id: ID.criticAgent,
            task_prompt_template_id: ID.reviewTemplate,
            system_override_template_id: ID.systemTemplate,
            bindings: [
              {
                variable_name: "draft",
                source: { kind: "stage_output", stage_id: ID.draftStage, path: "/draft" },
              },
            ],
            output: {
              format: "json",
              json_schema: reviewSchema,
              validators: [
                { kind: "range", path: "/score", min: 0, max: 1 },
                { kind: "regex", path: "/verdict", pattern: "^[A-Za-z ,.'-]{3,400}$" },
              ],
              on_invalid: { action: "retry", max_attempts: 3 },
            },
          },
          {
            id: ID.reviseStage,
            name: "revise",
            agent_id: ID.writerAgent,
            task_prompt_template_id: ID.reviseTemplate,
            system_override_template_id: null,
            bindings: [
              {
                variable_name: "draft",
                source: { kind: "stage_output", stage_id: ID.draftStage, path: "/draft" },
              },
              {
                variable_name: "critique",
                source: { kind: "stage_output", stage_id: ID.reviewStage, path: "/verdict" },
              },
              { variable_name: "history", source: { kind: "carried", carry_name: "history" } },
            ],
            // Markdown with no validators: the unguarded consumer A2 flags.
            output: { format: "markdown", validators: [], on_invalid: { action: "fail" } },
          },
        ],
        loop: {
          max_iterations: 4,
          stop_when: "any",
          stop_conditions: [
            {
              id: "accepted",
              kind: "field_truthy",
              stage_id: ID.reviewStage,
              path: "/accepted",
              terminal_state: "success",
            },
            {
              id: "good_enough",
              kind: "score_threshold",
              stage_id: ID.reviewStage,
              path: "/score",
              comparator: "gte",
              threshold: 0.9,
              terminal_state: "success",
            },
            {
              id: "no_movement",
              kind: "unchanged",
              observations: [
                { stage_id: ID.draftStage, path: "/draft" },
                { stage_id: ID.reviewStage, path: "/score" },
              ],
              window: 2,
              terminal_state: "stagnated",
            },
          ],
          carries: [
            {
              name: "history",
              source_stage_id: ID.reviseStage,
              source_path: "",
              value_type: "string",
              initial_value: "",
              carry_mode: "append",
              max_serialized_chars: 32_000,
            },
            {
              name: "last_score",
              source_stage_id: ID.reviewStage,
              source_path: "/score",
              value_type: "number",
              initial_value: 0,
              carry_mode: "replace",
              max_serialized_chars: 100,
            },
          ],
          budget: {
            // Structural bound is 4 iterations x (2 + 3 + 1) = 24 calls.
            // Declaring 8 makes this pipeline reach its budget first.
            max_total_tokens: 200_000,
            max_wall_clock_ms: 600_000,
            max_model_calls: 8,
          },
          on_exhausted: "return_last",
        },
        examples: [
          {
            id: "golden_case",
            kind: "golden",
            input: { topic: "tides", max_words: 400 },
            expected: {
              outcome: "valid",
              stage_id: ID.draftStage,
              output: { draft: "The moon pulls.", word_count: 3 },
            },
          },
          {
            id: "adversarial_case",
            kind: "adversarial",
            input: { topic: "tides", max_words: 400 },
            expected: {
              outcome: "invalid",
              stage_id: ID.draftStage,
              output: { draft: "", word_count: 0 },
              reason: "Empty draft and a zero word count both violate the contract.",
            },
          },
        ],
      },
    ],
    run_receipts: [],
  };
}

/** The parsed store. Throws if the fixture stopped being a valid document. */
export function validStore(): LoopForwardStore {
  const parsed = parseLoopForwardStore(rawStore());
  if (!parsed.ok) {
    throw new Error(
      `fixture does not parse: ${parsed.error.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.value;
}
