import { describe, expect, it } from "vitest";
import {
  humanizeProfileSlug,
  renderProjectGetHuman,
  renderProjectListHuman,
  splitCanonicalProfileId,
} from "../src/commands/project.js";

describe("renderProjectGetHuman", () => {
  it("renders a structured operator-facing summary", () => {
    const out = renderProjectGetHuman(
      {
        project: {
          id: "sw-arch-rust-cli-greet",
          name: "Rust CLI greet",
          profile_id: "profile:software-architecture:1.0",
          revision: 130,
          description: "Reference CLI architecture graph",
        },
      },
      { primitives: 64, relations: 57, templates: 0, test_suites: 0 },
    );
    expect(out).toContain("Project: sw-arch-rust-cli-greet");
    expect(out).toContain("Name: Rust CLI greet");
    expect(out).toContain("Profile: profile:software-architecture:1.0");
    expect(out).toContain("Revision: 130");
    expect(out).toContain("Description: Reference CLI architecture graph");
    expect(out).toContain("Counts:");
    expect(out).toContain("  Primitives: 64");
    expect(out).toContain("  Relations: 57");
  });
  it("omits the description line when the project has no description", () => {
    const out = renderProjectGetHuman(
      {
        project: {
          id: "demo-project",
          name: "Demo project",
          profile_id: "profile:formal-specification:3.0",
          revision: 1,
        },
      },
      { primitives: 0, relations: 0, templates: 0, test_suites: 0 },
    );
    expect(out).toContain("Project: demo-project");
    expect(out).toContain("Name: Demo project");
    expect(out).toContain("Counts:");
    expect(out).not.toContain("Description:");
    expect(out).not.toContain("demo-project@");
    expect(out).not.toContain("primitives=0 relations=0");
  });
});

describe("project list profile presentation", () => {
  it("splits canonical profile ids into slug and version", () => {
    expect(splitCanonicalProfileId("profile:software-architecture:1.0")).toEqual({
      labelSlug: "software-architecture",
      version: "1.0",
    });
  });

  it("humanizes profile slugs for table output", () => {
    expect(humanizeProfileSlug("formal-specification")).toBe("Formal Specification");
    expect(humanizeProfileSlug("spec-authoring:dnis")).toBe("Spec Authoring / Dnis");
  });

  it("renders a friendly profile label and separate version column", () => {
    const out = renderProjectListHuman([
      {
        id: "roadmap-v052",
        profile_label: "Formal Specification",
        profile_version: "3.0",
        revision: 1002,
        name: "Roadmap Unified v0.5.2",
      },
    ]);
    expect(out).toContain("PROFILE");
    expect(out).toContain("PROFILE VER");
    expect(out).toContain("Formal Specification");
    expect(out).toContain("3.0");
    expect(out).not.toContain("profile:formal-specification:3.0");
  });
});
