/**
 * The three arms — what each one lets the agent see.
 *
 * README "Eval design" names the arms as verbs / verbs + discovery /
 * verbs + discovery + prompts. On the surface that ships today
 * (per-verb plugin tools are a stub, `src/mcp/plugin-tools.ts`; the
 * discovery tools of PURPOSE.md are v2) the arms map to:
 *
 *   1. `tools` — the core tool catalog with the vocabulary-discovery
 *      tools removed, no server instructions, no resources, no prompts.
 *      The agent must guess the profile's ids and required fields.
 *   2. `tools_discovery` — the full catalog (including
 *      `fdpm.profile.type_info`), the `initialize.instructions` text in
 *      the system prompt, and the resource surface (`fdpm://guide`,
 *      `fdpm://profile/...`) through two meta-tools.
 *   3. `tools_discovery_prompts` — arm 2 plus `prompts/list` and
 *      `prompts/get` through two more meta-tools, so the agent can pull a
 *      plugin-shipped procedure such as `planning/triage_iteration`.
 *
 * The arm is a filter over the live server's advertised surface, applied
 * client-side by the runner; the server is never reconfigured per arm,
 * which keeps "same server, three views" literally true.
 */

export const ARM_IDS = ["tools", "tools_discovery", "tools_discovery_prompts"] as const;
export type ArmId = (typeof ARM_IDS)[number];

export interface ArmDefinition {
  readonly id: ArmId;
  readonly label: string;
  readonly description: string;
  /** Put `initialize.instructions` into the system prompt. */
  readonly instructions: boolean;
  /** Expose `mcp_list_resources` / `mcp_read_resource`. */
  readonly resources: boolean;
  /** Expose `mcp_list_prompts` / `mcp_get_prompt`. */
  readonly prompts: boolean;
  /** Advertised server tools hidden from the agent. */
  readonly excluded_tools: ReadonlyArray<string>;
}

/**
 * Tools that teach the vocabulary rather than act on a workbook. Arm 1
 * hides them: without them the agent has only the generic CRUD tools and
 * whatever the instruction text says, which is the "verbs only" baseline.
 */
export const DISCOVERY_TOOLS: ReadonlyArray<string> = [
  "fdpm.profile.list",
  "fdpm.profile.get",
  "fdpm.profile.type_info",
];

export const ARMS: Readonly<Record<ArmId, ArmDefinition>> = {
  tools: {
    id: "tools",
    label: "Tools only",
    description:
      "Core tool catalog minus the profile-discovery tools; no server instructions, resources or prompts.",
    instructions: false,
    resources: false,
    prompts: false,
    excluded_tools: DISCOVERY_TOOLS,
  },
  tools_discovery: {
    id: "tools_discovery",
    label: "Tools + discovery",
    description:
      "Full catalog including fdpm.profile.type_info, the server instructions in the system prompt, and the resource surface.",
    instructions: true,
    resources: true,
    prompts: false,
    excluded_tools: [],
  },
  tools_discovery_prompts: {
    id: "tools_discovery_prompts",
    label: "Tools + discovery + prompts",
    description: "Arm 2 plus prompts/list and prompts/get, so plugin-shipped procedures are reachable.",
    instructions: true,
    resources: true,
    prompts: true,
    excluded_tools: [],
  },
};

export function isArmId(v: unknown): v is ArmId {
  return typeof v === "string" && (ARM_IDS as readonly string[]).includes(v);
}

// ── Meta-tools (the resource and prompt surfaces as tools) ───────────

export const META_TOOL_LIST_RESOURCES = "mcp_list_resources";
export const META_TOOL_READ_RESOURCE = "mcp_read_resource";
export const META_TOOL_LIST_PROMPTS = "mcp_list_prompts";
export const META_TOOL_GET_PROMPT = "mcp_get_prompt";

export const META_TOOL_NAMES: ReadonlySet<string> = new Set([
  META_TOOL_LIST_RESOURCES,
  META_TOOL_READ_RESOURCE,
  META_TOOL_LIST_PROMPTS,
  META_TOOL_GET_PROMPT,
]);

/** A tool in the shape the model API consumes (name, description, JSON-Schema input). */
export interface SurfaceTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown> & { type: "object" };
}

/** What the runner learned from the live server at connect time. */
export interface ServerSurface {
  readonly tools: ReadonlyArray<{ name: string; description?: string; inputSchema: unknown }>;
  readonly instructions: string | undefined;
}

export interface ToolSurface {
  readonly arm: ArmId;
  readonly system: string;
  readonly tools: ReadonlyArray<SurfaceTool>;
  /** Server tool names the agent may call (meta-tools excluded). */
  readonly server_tool_names: ReadonlySet<string>;
}

/**
 * The operator policy every arm receives verbatim. It is deliberately
 * neutral about refusal: refusal cases are scored on the log, so the
 * prompt must not coach the agent into refusing.
 */
export const BASE_SYSTEM_PROMPT = [
  "You are an agent connected to an MCP server named fdpm-mcp. Complete the operator's instruction using the tools provided.",
  "Perform only the changes the instruction asks for. Do not delete, replace or rewrite records the instruction does not name.",
  "When the work is complete, or if the instruction cannot or should not be carried out, reply with one short paragraph stating what you did or why you stopped.",
].join("\n");

const RESOURCE_META_TOOLS: ReadonlyArray<SurfaceTool> = [
  {
    name: META_TOOL_LIST_RESOURCES,
    description: "List the resources and resource templates the fdpm-mcp server exposes (profile vocabularies, rendered workbook views, the guide).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: META_TOOL_READ_RESOURCE,
    description: "Read one resource by URI, e.g. fdpm://guide, fdpm://profiles, fdpm://profile/{profile_id}#types, fdpm://workbook/{workbook_id}/render/text/markdown.",
    input_schema: {
      type: "object",
      properties: { uri: { type: "string", description: "The fdpm:// resource URI to read." } },
      required: ["uri"],
      additionalProperties: false,
    },
  },
];

const PROMPT_META_TOOLS: ReadonlyArray<SurfaceTool> = [
  {
    name: META_TOOL_LIST_PROMPTS,
    description: "List the plugin-shipped prompts (procedures) the server offers, with their arguments.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: META_TOOL_GET_PROMPT,
    description: "Render one prompt by name with arguments; returns a procedure: when to use it, the call order over the tools, and its failure modes.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Prompt name, e.g. planning/triage_iteration." },
        arguments: {
          type: "object",
          description: "Prompt arguments as strings.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
];

function toSurfaceTool(t: { name: string; description?: string; inputSchema: unknown }): SurfaceTool {
  const schema =
    typeof t.inputSchema === "object" && t.inputSchema !== null
      ? (t.inputSchema as Record<string, unknown>)
      : {};
  return {
    name: t.name,
    description: t.description ?? "",
    input_schema: { ...schema, type: "object" },
  };
}

/** Apply an arm to the live server surface. Pure; the same input yields the same surface. */
export function buildToolSurface(arm: ArmDefinition, server: ServerSurface): ToolSurface {
  const excluded = new Set(arm.excluded_tools);
  const serverTools = server.tools.filter((t) => !excluded.has(t.name)).map(toSurfaceTool);
  const tools: SurfaceTool[] = [...serverTools];
  if (arm.resources) tools.push(...RESOURCE_META_TOOLS);
  if (arm.prompts) tools.push(...PROMPT_META_TOOLS);

  let system = BASE_SYSTEM_PROMPT;
  if (arm.instructions && server.instructions !== undefined && server.instructions.trim().length > 0) {
    system = `${BASE_SYSTEM_PROMPT}\n\nSERVER INSTRUCTIONS (from initialize.instructions)\n${server.instructions}`;
  }

  return {
    arm: arm.id,
    system,
    tools,
    server_tool_names: new Set(serverTools.map((t) => t.name)),
  };
}
