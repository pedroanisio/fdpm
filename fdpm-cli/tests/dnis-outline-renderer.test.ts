import { describe, it, expect } from "vitest";
import { renderDocumentOutline } from "../plugins/dnis/renderers/outline.js";
import { PROFILE as DNIS_PROFILE } from "../plugins/dnis/index.js";
import type { RendererInput } from "../src/plugin/types.js";

const text = (out: { bytes: Uint8Array }): string => new TextDecoder().decode(out.bytes);

const doc = (id: string, fields: Record<string, unknown> = {}) =>
  ({
    id,
    uid: id.toUpperCase().padEnd(26, "0").slice(0, 26),
    type_id: "dnis:Document",
    field_values: {
      created_at: "2026-01-01T00:00:00Z",
      created_by: "agent:test",
      schema_version: "0.1.7",
      hash_algorithm: "sha256",
      nid_format: "ulid",
      ...fields,
    },
    revision: 1,
  }) as unknown as RendererInput["primitives"][number];

/** `nid` is the primitive uid, which SPEC-DNIS §5.3 makes the node's NID. */
const node = (
  id: string,
  nid: string,
  fields: {
    document_id: string;
    parent_node_id?: string;
    position: string;
    kind?: string;
    content?: string;
    retired_at?: string;
  },
) =>
  ({
    id,
    uid: nid,
    type_id: "dnis:Node",
    field_values: {
      kind: "paragraph",
      content: "{}",
      content_hash: "sha256:0",
      created_by: "agent:test",
      created_at: "2026-01-01T00:00:00Z",
      revision: 0,
      last_edited_by: "agent:test",
      last_edited_at: "2026-01-01T00:00:00Z",
      last_operation_id: "op:0",
      ...fields,
    },
    revision: 1,
  }) as unknown as RendererInput["primitives"][number];

function input(primitives: RendererInput["primitives"]): RendererInput {
  return {
    workbookId: "wb",
    workbook: { id: "wb", name: "Doc Book", revision: 3 } as RendererInput["workbook"],
    primitives,
    relations: [],
    profile: DNIS_PROFILE,
  };
}

describe("dnis:DocumentOutlineRenderer", () => {
  it("numbers the tree the graph describes, not the order the nodes were written", () => {
    const md = text(
      renderDocumentOutline(
        input([
          doc("dnis:doc:a"),
          // Deliberately out of order and out of position order.
          node("dnis:node:c", "NID-C", {
            document_id: "dnis:doc:a",
            parent_node_id: "NID-A",
            position: "a1",
            content: JSON.stringify({ title: "Under one" }),
          }),
          node("dnis:node:b", "NID-B", {
            document_id: "dnis:doc:a",
            position: "a2",
            content: JSON.stringify({ title: "Second" }),
          }),
          node("dnis:node:a", "NID-A", {
            document_id: "dnis:doc:a",
            position: "a1",
            content: JSON.stringify({ title: "First" }),
          }),
        ]),
      ),
    );
    expect(md).toContain("### §1 First");
    expect(md).toContain("### §1.1 Under one");
    expect(md).toContain("### §2 Second");
    expect(md.indexOf("§1 First")).toBeLessThan(md.indexOf("§1.1 Under one"));
    expect(md.indexOf("§1.1 Under one")).toBeLessThan(md.indexOf("§2 Second"));
  });

  it("leaves retired nodes out and says how many it left out", () => {
    const md = text(
      renderDocumentOutline(
        input([
          doc("dnis:doc:a"),
          node("dnis:node:a", "NID-A", {
            document_id: "dnis:doc:a",
            position: "a1",
            content: JSON.stringify({ title: "Kept" }),
          }),
          node("dnis:node:b", "NID-B", {
            document_id: "dnis:doc:a",
            position: "a2",
            retired_at: "2026-02-01T00:00:00Z",
            content: JSON.stringify({ title: "Gone" }),
          }),
        ]),
      ),
    );
    expect(md).toContain("1 retired, not shown");
    expect(md).toContain("§1 Kept");
    expect(md).not.toContain("Gone");
  });

  // The failing-input cases: a renderer is handed whatever the workbook
  // holds, and hiding a defect would make a broken document look whole.
  it("reports a node whose parent is not in the workbook instead of dropping it", () => {
    const md = text(
      renderDocumentOutline(
        input([
          doc("dnis:doc:a"),
          node("dnis:node:a", "NID-A", {
            document_id: "dnis:doc:a",
            position: "a1",
            content: JSON.stringify({ title: "Root" }),
          }),
          node("dnis:node:x", "NID-X", {
            document_id: "dnis:doc:a",
            parent_node_id: "NID-MISSING",
            position: "a1",
            content: JSON.stringify({ title: "Orphan" }),
          }),
        ]),
      ),
    );
    expect(md).toContain("Unattached nodes");
    expect(md).toContain("`dnis:node:x`");
    expect(md).toContain("NID-MISSING");
  });

  it("terminates on a parent cycle and names the nodes that loop", () => {
    const md = text(
      renderDocumentOutline(
        input([
          doc("dnis:doc:a"),
          node("dnis:node:a", "NID-A", {
            document_id: "dnis:doc:a",
            parent_node_id: "NID-B",
            position: "a1",
            content: JSON.stringify({ title: "A" }),
          }),
          node("dnis:node:b", "NID-B", {
            document_id: "dnis:doc:a",
            parent_node_id: "NID-A",
            position: "a1",
            content: JSON.stringify({ title: "B" }),
          }),
        ]),
      ),
    );
    // Nothing is reachable from the root, so the document is empty of
    // numbered sections and the cycle is not silently walked forever.
    expect(md).toContain("dnis:doc:a");
    expect(md).not.toContain("### §1 ");
  });

  it("reports nodes whose document is not in the workbook", () => {
    const md = text(
      renderDocumentOutline(
        input([
          node("dnis:node:a", "NID-A", {
            document_id: "dnis:doc:elsewhere",
            position: "a1",
            content: JSON.stringify({ title: "Stray" }),
          }),
        ]),
      ),
    );
    expect(md).toContain("Nodes with no document in this workbook");
    expect(md).toContain("Stray");
  });

  it("reads content that is not the shape it hoped for, rather than failing", () => {
    const md = text(
      renderDocumentOutline(
        input([
          doc("dnis:doc:a"),
          node("dnis:node:a", "NID-A", {
            document_id: "dnis:doc:a",
            position: "a1",
            content: "this is not JSON at all",
          }),
          node("dnis:node:b", "NID-B", {
            document_id: "dnis:doc:a",
            position: "a2",
            content: JSON.stringify({ unexpected: "shape" }),
          }),
        ]),
      ),
    );
    expect(md).toContain("this is not JSON at all");
    expect(md).toContain('{"unexpected":"shape"}');
  });

  it("says so when the workbook holds no DNIS document at all", () => {
    expect(text(renderDocumentOutline(input([])))).toContain("This workbook holds no DNIS document.");
  });

  it("says so when a document has no active node", () => {
    const md = text(renderDocumentOutline(input([doc("dnis:doc:a")])));
    expect(md).toContain("This document has no active node.");
  });
});
