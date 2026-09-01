import { describe, it, expect } from "vitest";
import {
  CORE_RENDERER_BINDING,
  CORE_RENDERER_ID,
  CORE_RENDERER_TARGET,
  renderWorkbookMarkdown,
} from "../src/core/profile/core-renderer.js";
import { CORE_EMPTY_PROFILE } from "../src/core/profile/core-empty.js";
import type { DomainProfile } from "../src/core/models/meta.js";
import type { RendererInput } from "../src/plugin/types.js";

const text = (out: { bytes: Uint8Array }): string => new TextDecoder().decode(out.bytes);

const PROFILE: DomainProfile = {
  ...CORE_EMPTY_PROFILE,
  id: "test:profile",
  primitive_types: [
    {
      id: "t:Note",
      name: "Note",
      fields: [],
      id_format: { pattern: "^note:.+$", uniqueness: "workbook", pattern_kind: "regex" },
      category: "core:category:general",
      scoped: false,
      is_partition_unit: false,
      validations: [],
      relations: [],
      scope_id: "",
      inline_structs: [],
    } as unknown as DomainProfile["primitive_types"][number],
  ],
  relation_types: [
    {
      id: "t:Mentions",
      name: "Mentions",
      fields: [],
      symmetric: false,
      transitive: false,
    } as unknown as DomainProfile["relation_types"][number],
  ],
};

function input(over: Partial<RendererInput> = {}): RendererInput {
  return {
    workbookId: "wb-1",
    workbook: { id: "wb-1", name: "A Workbook", revision: 7 } as RendererInput["workbook"],
    primitives: [],
    relations: [],
    profile: PROFILE,
    ...over,
  };
}

const note = (id: string, fields: Record<string, unknown>) =>
  ({
    id,
    uid: id.toUpperCase().padEnd(26, "0"),
    type_id: "t:Note",
    field_values: fields,
    revision: 1,
  }) as unknown as RendererInput["primitives"][number];

const edge = (
  id: string,
  source: string,
  target: string,
  fields: Record<string, unknown> = {},
) =>
  ({
    id,
    uid: id.toUpperCase().padEnd(26, "0"),
    type_id: "t:Mentions",
    source_id: source,
    target_id: target,
    field_values: fields,
    revision: 1,
  }) as unknown as RendererInput["relations"][number];

describe("core:WorkbookRenderer", () => {
  it("is the binding every profile carries, at the target it renders", () => {
    expect(CORE_RENDERER_BINDING.renderer_id).toBe(CORE_RENDERER_ID);
    expect(CORE_RENDERER_BINDING.output_format).toBe(CORE_RENDERER_TARGET);
  });

  it("states the workbook's identity before its contents", () => {
    const out = renderWorkbookMarkdown(input({ primitives: [note("note:a", { title: "Alpha" })] }));
    const md = text(out);
    expect(md).toContain("# A Workbook");
    expect(md).toContain("profile `test:profile`");
    expect(md).toContain("revision 7");
    expect(md).toContain("1 primitive");
    expect(md).toContain("0 relations");
    expect(out.contentType).toBe("text/markdown");
  });

  it("groups primitives under the type name the profile declares", () => {
    const out = renderWorkbookMarkdown(
      input({ primitives: [note("note:a", { title: "Alpha", priority: 3 })] }),
    );
    const md = text(out);
    expect(md).toContain("## Note");
    expect(md).toContain("### Alpha");
    expect(md).toContain("`note:a`");
    expect(md).toContain("- **priority** 3");
  });

  it("falls back to the id when no field reads as a title", () => {
    const out = renderWorkbookMarkdown(input({ primitives: [note("note:b", { weight: 2 })] }));
    expect(text(out)).toContain("### note:b");
  });

  it("says an empty workbook is empty rather than rendering an empty page", () => {
    const md = text(renderWorkbookMarkdown(input()));
    expect(md).toContain("This workbook is empty.");
    expect(md).not.toContain("## Relations");
  });

  it("renders relations as a table naming both endpoints", () => {
    const out = renderWorkbookMarkdown(
      input({
        primitives: [note("note:a", { title: "Alpha" })],
        relations: [edge("rel:1", "note:a", "note:b")],
      }),
    );
    const md = text(out);
    expect(md).toContain("## Relations");
    expect(md).toContain("| Mentions | `note:a` | `note:b` |");
  });

  // The defect this column exists to close: a relation's field_values were
  // dropped, so two edges of the same type between the same endpoints — the
  // ordinary way a profile says "wrote it" and "performed in it" — rendered
  // as indistinguishable duplicate rows. A reviewer reading the artifact
  // could not tell a fact from an inference, or a writer from an actor.
  it("distinguishes two edges of one type between the same endpoints by their fields", () => {
    const out = renderWorkbookMarkdown(
      input({
        relations: [
          edge("rel:wrote", "work:x", "agent:y", { role: "screenwriter", billingPosition: 1 }),
          edge("rel:acted", "work:x", "agent:y", { role: "performer", billingPosition: 1 }),
        ],
      }),
    );
    const md = text(out);
    const rows = md.split("\n").filter((l) => l.startsWith("| Mentions |"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows).size).toBe(2);
    expect(rows[0]).toContain("**role** screenwriter");
    expect(rows[1]).toContain("**role** performer");
    expect(rows[0]).toContain("**billingPosition** 1");
  });

  it("carries the epistemic fields an assertion is marked with into the table", () => {
    const md = text(
      renderWorkbookMarkdown(
        input({
          relations: [
            edge("rel:i", "ann:a", "work:x", { assertionKind: "inference", confidence: 0.75 }),
            edge("rel:f", "ann:b", "work:x", { assertionKind: "fact" }),
          ],
        }),
      ),
    );
    expect(md).toContain("**assertionKind** inference");
    expect(md).toContain("**confidence** 0.75");
    expect(md).toContain("**assertionKind** fact");
  });

  it("adds the fields column only when some relation carries a field", () => {
    const bare = text(renderWorkbookMarkdown(input({ relations: [edge("rel:1", "a", "b")] })));
    expect(bare).toContain("| Relation | From | To |");
    expect(bare).not.toContain("| Relation | From | To | Fields |");

    const rich = text(
      renderWorkbookMarkdown(
        input({ relations: [edge("rel:1", "a", "b", { role: "performer" })] }),
      ),
    );
    expect(rich).toContain("| Relation | From | To | Fields |");
  });

  it("marks the fieldless rows of a table that has a fields column", () => {
    const md = text(
      renderWorkbookMarkdown(
        input({
          relations: [
            edge("rel:1", "a", "b", { role: "performer" }),
            edge("rel:2", "a", "c"),
          ],
        }),
      ),
    );
    expect(md).toContain("| Mentions | `a` | `c` | — |");
  });

  // Same failing input the primitive path is given: a relation field is not
  // a safer string than a primitive field.
  it("keeps a relation field from breaking the table it sits in", () => {
    const md = text(
      renderWorkbookMarkdown(
        input({
          relations: [
            edge("rel:1", "a", "b", { note: "x | y\nsecond line", body: { a: 1 } }),
          ],
        }),
      ),
    );
    const rows = md.split("\n").filter((l) => l.startsWith("| Mentions |"));
    expect(rows).toHaveLength(1);
    // The pipe survives as an escaped literal, so it is still a `|` in the
    // text; what matters is that it is not a column delimiter. The row must
    // hold exactly the columns the header declares, no more.
    const columns = (line: string) => line.replaceAll("\\|", "").split("|").length;
    const header = md.split("\n").find((l) => l.startsWith("| Relation |")) ?? "";
    expect(columns(rows[0])).toBe(columns(header));
    expect(rows[0]).toContain("x \\| y second line");
  });

  // A renderer is fed whatever the workbook holds, and a value that breaks
  // the document's own syntax is the failing input it has to survive.
  it("keeps a value that contains Markdown's own characters from breaking the page", () => {
    const out = renderWorkbookMarkdown(
      input({
        primitives: [note("note:c", { title: "Pipes", note: "a | b\nsecond line" })],
      }),
    );
    const md = text(out);
    expect(md).toContain("a \\| b second line");
    expect(md.split("\n").filter((l) => l.startsWith("- **note**")).length).toBe(1);
  });

  it("survives values no schema anticipated", () => {
    const out = renderWorkbookMarkdown(
      input({
        primitives: [
          note("note:d", {
            title: "Odd",
            nothing: null,
            missing: undefined,
            empty: [],
            list: ["a", "b"],
            nested: { a: 1 },
          }),
        ],
      }),
    );
    const md = text(out);
    expect(md).toContain("- **nothing** —");
    expect(md).toContain("- **empty** —");
    expect(md).toContain("- **list** a, b");
    expect(md).toContain('- **nested** `{"a":1}`');
  });

  it("names an unknown type by its id rather than inventing a label", () => {
    const out = renderWorkbookMarkdown(
      input({
        primitives: [
          {
            id: "x:1",
            uid: "X1000000000000000000000000",
            type_id: "t:NotInProfile",
            field_values: {},
            revision: 1,
          } as unknown as RendererInput["primitives"][number],
        ],
      }),
    );
    const md = text(out);
    expect(md).toContain("## t:NotInProfile");
    expect(md).toContain("No field carries a value.");
  });

  it("offers a filename derived from the workbook name", () => {
    const out = renderWorkbookMarkdown(input({ primitives: [note("note:a", { title: "A" })] }));
    expect(out.filename).toBe("A-Workbook.md");
  });

  it("falls back to the workbook id when there is no name", () => {
    const out = renderWorkbookMarkdown(input({ workbook: undefined }));
    expect(text(out)).toContain("# wb-1");
  });
});
