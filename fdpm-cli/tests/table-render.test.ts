import { describe, expect, it } from "vitest";
import { renderTable } from "../src/commands/util.js";
import { renderProjectListHuman } from "../src/commands/project.js";

describe("renderTable", () => {
  it("renders a header row with aligned columns", () => {
    const out = renderTable(
      [
        { id: "a", rev: 2, name: "Alpha" },
        { id: "longer-id", rev: 14, name: "Beta" },
      ],
      [
        { header: "ID", value: (row) => row.id },
        { header: "REV", value: (row) => row.rev, align: "right" },
        { header: "NAME", value: (row) => row.name },
      ],
      { empty: "(none)" },
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("ID         REV  NAME ");
    expect(lines[1]).toBe("a            2  Alpha");
    expect(lines[2]).toBe("longer-id   14  Beta ");
  });

  it("returns the empty message when there are no rows", () => {
    expect(
      renderTable([], [{ header: "ID", value: () => "x" }], { empty: "(none)" }),
    ).toBe("(none)");
  });
});

describe("renderProjectListHuman", () => {
  it("uses headered columns instead of raw tab-separated rows", () => {
    const out = renderProjectListHuman([
      {
        id: "roadmap-v052",
        profile_id: "profile:formal-specification:3.0",
        revision: 1002,
        name: "Roadmap Unified v0.5.2",
      },
    ]);
    expect(out).toContain("PROJECT ID");
    expect(out).toContain("PROFILE");
    expect(out).toContain("REV");
    expect(out).toContain("NAME");
    expect(out).not.toContain("\trev=");
  });
});
