/**
 * The MCP prompt must not drift from the profile it teaches.
 *
 * A prompt is the only surface where an agent is told *which* type and
 * relation ids to use. If the profile renames one, a stale prompt sends
 * every consumer at a type that no longer exists — and nothing else in
 * the suite would notice. So every uml: id the body mentions is checked
 * against the registered profile, and the §13.5 contract (listing size,
 * required sections, argument resolution) is checked on the real
 * pipeline rather than on the object literal.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { renderPrompt } from "../../../src/mcp/prompts.js";
import { MODEL_A_DOMAIN_PROMPT, UML_PROMPTS } from "../../../plugins/uml/prompts.js";
import { PROFILE_ID } from "../../../plugins/uml/sidecar.js";
import { isAbstractMetaclass } from "../../../plugins/uml/abstract.js";

let host: Host;
let body: string;
beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  const rendered = await renderPrompt(
    host.plugins.findPrompt("uml/model_a_domain")!,
    { workbook_id: "uml-library", subject: "order fulfilment" },
  );
  body = rendered.messages.map((m) => (m.content as { text: string }).text).join("\n");
});

describe("registration and the §13.5 contract", () => {
  it("is registered by the plugin, not merely exported", () => {
    expect(host.plugins.listPrompts().map((p) => p.promptId)).toContain("uml/model_a_domain");
    expect(UML_PROMPTS).toHaveLength(1);
  });

  it("carries the three sections a skill must have", () => {
    expect(body).toContain("## When to use");
    expect(body).toContain("## Call order");
    expect(body).toContain("## Failure modes");
  });

  it("keeps the listing entry inside the progressive-disclosure budget", () => {
    const listing = {
      name: MODEL_A_DOMAIN_PROMPT.promptId,
      title: MODEL_A_DOMAIN_PROMPT.title,
      description: MODEL_A_DOMAIN_PROMPT.description,
      arguments: MODEL_A_DOMAIN_PROMPT.arguments,
    };
    expect(Buffer.byteLength(JSON.stringify(listing), "utf8")).toBeLessThanOrEqual(600);
    expect(MODEL_A_DOMAIN_PROMPT.description.length).toBeGreaterThanOrEqual(40);
    expect(MODEL_A_DOMAIN_PROMPT.description.length).toBeLessThanOrEqual(300);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(16 * 1024);
  });

  it("resolves its arguments into the body", () => {
    expect(body).toContain("uml-library");
    expect(body).toContain("order fulfilment");
  });

  it("refuses a missing required argument through the real pipeline", async () => {
    await expect(renderPrompt(host.plugins.findPrompt("uml/model_a_domain")!, {})).rejects.toThrow();
  });
});

describe("every id the prompt teaches exists in the profile", () => {
  it("names only real primitive types", () => {
    const profile = host.profiles.getResolved(PROFILE_ID);
    const known = new Set(profile.primitive_types.map((p) => p.id));
    const abstractOnPurpose = new Set(
      [...body.matchAll(/uml:[A-Z][A-Za-z]*/g)].map((m) => m[0]).filter((id) => isAbstractMetaclass(id.split(":")[1]!)),
    );
    const mentioned = [...new Set([...body.matchAll(/\buml:[A-Z][A-Za-z]*\b/g)].map((m) => m[0]))];
    const relations = new Set((profile.relation_types ?? []).map((r) => r.id));
    const unknown = mentioned.filter(
      (id) => !known.has(id) && !relations.has(id) && !abstractOnPurpose.has(id) && id !== "uml:ModelOutlineRenderer",
    );
    expect(unknown).toEqual([]);
  });

  it("names only real relation types where it teaches wiring", () => {
    const relations = new Set(
      (host.profiles.getResolved(PROFILE_ID).relation_types ?? []).map((r) => r.id),
    );
    // Every relation the modelling procedure depends on must be taught.
    for (const id of ["uml:Owns", "uml:OwnsAttribute", "uml:OwnsOperation", "uml:OwnsParameter", "uml:OwnsLiteral", "uml:OwnsReception", "uml:Signals", "uml:TypedBy", "uml:MemberEnd", "uml:Specializes", "uml:Realizes", "uml:DependsOn", "uml:Annotates", "uml:Constrains", "uml:OwnsPort", "uml:OwnsConnector", "uml:OwnsConnectorEnd", "uml:ConnectorRole", "uml:PartWithPort", "uml:Provides", "uml:Requires", "uml:RealizesComponent", "uml:Manifests", "uml:NestsArtifact"]) {
      expect(relations.has(id), `${id} must exist in the profile`).toBe(true);
      expect(body, `${id} must be taught by the prompt`).toContain(id);
    }
  });

  it("mentions the abstract metaclasses only as things that will be refused", () => {
    // uml:Classifier appears in the failure modes; it must not appear in
    // the call order as something to create.
    const callOrder = body.slice(body.indexOf("## Call order"), body.indexOf("## Failure modes"));
    const abstractInCallOrder = [...callOrder.matchAll(/\buml:([A-Z][A-Za-z]*)\b/g)]
      .map((m) => m[1]!)
      .filter((n) => isAbstractMetaclass(n));
    expect(abstractInCallOrder).toEqual([]);
    expect(body).toContain("is abstract in UML 2.5.1");
  });

  it("teaches the connector's two-end rule, which the gate enforces", () => {
    expect(body).toContain("at least two uml:ConnectorEnd");
    expect(body).toMatch(/requires at least 2/);
  });

  it("teaches the numeric multiplicity, not UML's asterisk", () => {
    expect(body).toMatch(/-1 means UML's `\*`/);
    expect(body).toContain('Never write "*"');
  });
});
