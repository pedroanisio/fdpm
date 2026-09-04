import { describe, expect, it } from "vitest";
import {
  ARMS,
  ARM_IDS,
  BASE_SYSTEM_PROMPT,
  DISCOVERY_TOOLS,
  META_TOOL_GET_PROMPT,
  META_TOOL_LIST_PROMPTS,
  META_TOOL_LIST_RESOURCES,
  META_TOOL_NAMES,
  META_TOOL_READ_RESOURCE,
  buildToolSurface,
  isArmId,
  type ServerSurface,
} from "../../src/eval/arms.js";

const SERVER: ServerSurface = {
  instructions: "WORKFLOW\n1. Orient ...",
  tools: [
    { name: "fdpm.health", description: "health", inputSchema: { type: "object", properties: {} } },
    { name: "fdpm.profile.list", description: "profiles", inputSchema: { type: "object" } },
    { name: "fdpm.profile.get", description: "profile", inputSchema: { type: "object" } },
    { name: "fdpm.profile.type_info", description: "type info", inputSchema: { type: "object" } },
    { name: "fdpm.primitive.create", description: "create", inputSchema: { type: "object", properties: { workbook_id: { type: "string" } } } },
    { name: "fdpm.primitive.delete", inputSchema: { type: "object" } },
  ],
};

describe("eval arms — three views of one server", () => {
  it("names exactly three arms in README order", () => {
    expect(ARM_IDS).toEqual(["tools", "tools_discovery", "tools_discovery_prompts"]);
    expect(isArmId("tools")).toBe(true);
    expect(isArmId("verbs")).toBe(false);
  });

  it("arm 1 hides the discovery tools and carries no instructions, resources or prompts", () => {
    const s = buildToolSurface(ARMS.tools, SERVER);
    const names = s.tools.map((t) => t.name);
    for (const d of DISCOVERY_TOOLS) expect(names).not.toContain(d);
    expect(names).toContain("fdpm.primitive.create");
    expect(names).toContain("fdpm.primitive.delete");
    for (const m of META_TOOL_NAMES) expect(names).not.toContain(m);
    expect(s.system).toBe(BASE_SYSTEM_PROMPT);
    expect(s.server_tool_names.has("fdpm.profile.type_info")).toBe(false);
  });

  it("arm 2 adds discovery tools, the server instructions and the two resource meta-tools", () => {
    const s = buildToolSurface(ARMS.tools_discovery, SERVER);
    const names = s.tools.map((t) => t.name);
    for (const d of DISCOVERY_TOOLS) expect(names).toContain(d);
    expect(names).toContain(META_TOOL_LIST_RESOURCES);
    expect(names).toContain(META_TOOL_READ_RESOURCE);
    expect(names).not.toContain(META_TOOL_LIST_PROMPTS);
    expect(names).not.toContain(META_TOOL_GET_PROMPT);
    expect(s.system.startsWith(BASE_SYSTEM_PROMPT)).toBe(true);
    expect(s.system).toContain("SERVER INSTRUCTIONS");
    expect(s.system).toContain("WORKFLOW");
    // Meta-tools are not server tools.
    expect(s.server_tool_names.has(META_TOOL_READ_RESOURCE)).toBe(false);
    expect(s.server_tool_names.has("fdpm.profile.type_info")).toBe(true);
  });

  it("arm 3 adds the two prompt meta-tools on top of arm 2", () => {
    const s = buildToolSurface(ARMS.tools_discovery_prompts, SERVER);
    const names = s.tools.map((t) => t.name);
    expect(names).toContain(META_TOOL_LIST_PROMPTS);
    expect(names).toContain(META_TOOL_GET_PROMPT);
    expect(names.filter((n) => META_TOOL_NAMES.has(n))).toHaveLength(4);
  });

  it("keeps the base prompt neutral when the server offers no instructions", () => {
    const s = buildToolSurface(ARMS.tools_discovery, { ...SERVER, instructions: undefined });
    expect(s.system).toBe(BASE_SYSTEM_PROMPT);
  });

  it("normalises tool schemas into the model shape and is deterministic", () => {
    const a = buildToolSurface(ARMS.tools_discovery_prompts, SERVER);
    const b = buildToolSurface(ARMS.tools_discovery_prompts, SERVER);
    expect(a).toEqual(b);
    const del = a.tools.find((t) => t.name === "fdpm.primitive.delete")!;
    expect(del.description).toBe("");
    expect(del.input_schema.type).toBe("object");
    for (const t of a.tools) expect(t.input_schema.type).toBe("object");
  });

  it("the base prompt does not coach refusal", () => {
    expect(BASE_SYSTEM_PROMPT.toLowerCase()).not.toContain("refuse");
  });
});
