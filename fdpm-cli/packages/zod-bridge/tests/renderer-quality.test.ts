/**
 * Output quality of the generated per-entity renderer.
 *
 * 88 of the 103 renderers registered across this repo come from
 * `zodSchemaToMarkdownRenderer` — every entity of academic-paper (24),
 * style (15), uml (22), acme-business-deck (13), acme-pitch-deck (8) and
 * document-plan (6). What it emits is what most profiles look like, so
 * its defects are the repo's default reading experience:
 *
 *   # uml:Class uml:Class:01HQ8Z3K7M4N5P6R7S8T9V0011
 *   | Field | Value |
 *   | xmi_id | 01HQ8Z3K7M4N5P6R7S8T9V0011 |
 *   | xmi_type |  |
 *   | visibility |  |
 *
 * A machine identifier as the title, the id repeated in the body, blank
 * cells for every unset field, and raw snake_case column values. This
 * suite fixes what the output owes a reader instead.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodSchemaToMarkdownRenderer } from "../src/renderers.js";

const Schema = z.object({
  xmi_id: z.string(),
  name: z.string().optional(),
  qualified_name: z.string().optional(),
  is_abstract: z.boolean().default(false),
  visibility: z.enum(["public", "private"]).optional(),
  keywords: z.array(z.string()).default([]),
  default_value: z.object({ kind: z.string(), body: z.string() }).optional(),
});

const render = (values: Record<string, unknown>): string =>
  zodSchemaToMarkdownRenderer(Schema as never, { primitive_type_id: "uml:Class" }).renderer({
    id: "uml:Class:01HQ8Z3K7M4N5P6R7S8T9V0011",
    type_id: "uml:Class",
    field_values: values,
  });

describe("the heading names the thing, not its identifier", () => {
  it("uses a human name when the entity has one", () => {
    const md = render({ xmi_id: "01HQ", name: "Publication" });
    expect(md.split("\n")[0]).toBe("## Publication");
  });

  it("falls back through the conventional name fields", () => {
    for (const [field, value] of [["title", "A Title"], ["label", "A Label"]] as const) {
      const s = z.object({ [field]: z.string() }) as never;
      const md = zodSchemaToMarkdownRenderer(s, { primitive_type_id: "x:Thing" }).renderer({
        id: "x:Thing:abc",
        type_id: "x:Thing",
        field_values: { [field]: value },
      });
      expect(md.split("\n")[0]).toBe(`## ${value}`);
    }
  });

  it("falls back to the identifier's own slug when nothing names it", () => {
    const md = render({ xmi_id: "01HQ" });
    // The type, then the slug — never the full namespaced id twice.
    expect(md.split("\n")[0]).toBe("## Class `01HQ8Z3K7M4N5P6R7S8T9V0011`");
  });

  it("marks the type under the heading so the reader knows what they are looking at", () => {
    const md = render({ xmi_id: "01HQ", name: "Publication" });
    expect(md).toContain("`uml:Class`");
  });
});

describe("the table carries information, not blanks", () => {
  it("omits fields the instance does not set", () => {
    const md = render({ xmi_id: "01HQ", name: "Publication" });
    // No data row may carry an empty cell. (Checked per row: a naive
    // regex over the whole document matches the newline between the
    // header and the separator.)
    const dataRows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("|---"));
    for (const row of dataRows) {
      const cells = row.split("|").slice(1, -1).map((c) => c.trim());
      expect(cells.every((c) => c !== ""), `blank cell in: ${row}`).toBe(true);
    }
    expect(md).not.toContain("Qualified name");
    expect(md).not.toContain("Visibility");
  });

  it("keeps a field that is set to false or zero — those are values", () => {
    const md = render({ xmi_id: "01HQ", name: "P", is_abstract: false });
    expect(md).toContain("Is abstract");
    expect(md).toContain("no");
  });

  it("shows the identity row and nothing else when that is all there is", () => {
    const md = render({ xmi_id: "01HQ" });
    const dataRows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Field"));
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0]).toContain("Xmi id");
  });

  it("says so when an instance sets nothing at all", () => {
    const md = zodSchemaToMarkdownRenderer(z.object({ name: z.string().optional() }) as never, {
      primitive_type_id: "x:Thing",
    }).renderer({ id: "x:Thing:abc", type_id: "x:Thing", field_values: {} });
    expect(md).toMatch(/no fields set/i);
  });
});

describe("values are formatted for a reader", () => {
  it("renders booleans as yes/no rather than true/false", () => {
    expect(render({ xmi_id: "1", name: "P", is_abstract: true })).toContain("yes");
    expect(render({ xmi_id: "1", name: "P", is_abstract: false })).toContain("no");
  });

  it("renders a list as comma-separated values, and omits an empty one", () => {
    expect(render({ xmi_id: "1", name: "P", keywords: ["a", "b"] })).toContain("a, b");
    expect(render({ xmi_id: "1", name: "P", keywords: [] })).not.toContain("Keywords");
  });

  it("renders a struct as inline key/value pairs, not raw JSON", () => {
    const md = render({ xmi_id: "1", name: "P", default_value: { kind: "literal_string", body: "x" } });
    expect(md).not.toContain('{"kind"');
    expect(md).toContain("kind: literal_string");
  });

  it("escapes a pipe so it cannot break the table", () => {
    const md = render({ xmi_id: "1", name: "A | B" });
    expect(md.split("\n")[0]).toBe("## A | B");
    const row = md.split("\n").find((l) => l.startsWith("| Xmi id")) ?? "";
    expect(row.split("|").length).toBe(4); // "", field, value, ""
  });
});

describe("field labels read as words", () => {
  it("titles snake_case field names", () => {
    const md = render({ xmi_id: "1", name: "P", qualified_name: "a::b" });
    expect(md).toContain("| Qualified name |");
    expect(md).not.toContain("| qualified_name |");
  });
});

describe("determinism is preserved", () => {
  it("two calls with the same input are byte-equal", () => {
    const a = render({ xmi_id: "1", name: "P", keywords: ["x"] });
    const b = render({ xmi_id: "1", name: "P", keywords: ["x"] });
    expect(a).toBe(b);
  });
});
