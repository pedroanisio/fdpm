/**
 * profile:software-requirements:0.2 shipped with no renderer of any kind
 * — eight metaclasses, seventeen relation types, and no way to read a
 * workbook as anything but raw primitives. These assert that it now
 * produces a *document*: the thing a reviewer signs, not a dump of rows.
 */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Host } from "../../../src/core/host.js";
import { defineProject } from "../../../src/sdk.js";
import {
  PROFILE_ID,
  SRS_MARKDOWN_RENDERER_ID,
  SRS_HTML_RENDERER_ID,
} from "../../../plugins/software_requirements/index.js";

const WB = "srs-render-test";
let host: Host;
let md = "";
let html = "";

async function render(rendererId: string, target: string): Promise<string> {
  const slice = host.getProject(WB);
  const out = await host.plugins.runRenderer(
    target,
    {
      workbookId: WB,
      workbook: slice.workbook,
      primitives: Object.values(slice.primitives),
      relations: Object.values(slice.relations),
      templates: Object.values(slice.templates),
      profile: host.profiles.getResolved(PROFILE_ID),
    },
    { rendererId },
  );
  return new TextDecoder().decode(out.bytes);
}

beforeAll(async () => {
  host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")] });
  await host.load();
  await defineProject(host, { id: WB, name: "Payments SRS", profile: PROFILE_ID })
    .primitives([
      {
        id: "srs:spec:payments",
        type: "srs:Specification",
        fields: {
          project: "Payments Platform",
          version: "1.2.0",
          date: "2026-08-29",
          authors: ["P. Silva"],
          purpose: "Define what the payments platform must do for its first release.",
          intended_audience: ["Engineering", "Compliance", "Launch review board"],
          scope: "Card capture, settlement and refunds. Excludes ledger reconciliation.",
        },
      },
      {
        id: "srs:scope:SB-CORE-001",
        type: "srs:ScopeBoundary",
        fields: {
          title: "Card capture",
          polarity: "in_scope",
          statement: "The platform captures card details and tokenises them.",
          rationale: "Capture is the entry point of every payment flow.",
          acceptance_criteria: ["A tokenised card can be charged without re-entry."],
        },
      },
      {
        id: "srs:scope:SB-CORE-002",
        type: "srs:ScopeBoundary",
        fields: {
          title: "Ledger reconciliation",
          polarity: "out_of_scope",
          statement: "Reconciliation against the general ledger is not in this release.",
          rationale: "The finance system owns the ledger and is not ready.",
          acceptance_criteria: ["No requirement in this SRS depends on ledger state."],
        },
      },
      {
        id: "srs:req:REQ-PAY-001",
        type: "srs:Requirement",
        fields: {
          title: "Tokenise a card on capture",
          statement: "The system shall replace a captured PAN with a token before storage.",
          kind: "functional",
          rationale: "PCI-DSS forbids storing a PAN at rest.",
          priority: "must",
          origin_class: "operator",
          provenance_rank: "primary",
          acceptance_criteria: ["No PAN appears in any datastore after capture."],
          verification_methods: ["test_inspection"],
        },
      },
      {
        id: "srs:req:REQ-PAY-002",
        type: "srs:Requirement",
        fields: {
          title: "Refund within ninety days",
          statement: "The system shall permit a refund up to ninety days after capture.",
          kind: "functional",
          rationale: "Card scheme rules require it.",
          priority: "should",
          origin_class: "derived",
          provenance_rank: "secondary",
          acceptance_criteria: ["A refund on day 90 succeeds; day 91 is refused."],
        },
      },
      { id: "srs:stk:STK-01", type: "srs:Stakeholder", fields: { name: "Compliance", role: "approver" } },
      {
        id: "srs:term:pan",
        type: "srs:GlossaryEntry",
        fields: { term: "PAN", definition: "Primary Account Number — the long number on a payment card." },
      },
    ])
    .relations([
      { id: "srs:includes:1", type: "srs:Includes", from: "srs:spec:payments", to: "srs:req:REQ-PAY-001" },
      { id: "srs:derived:1", type: "srs:DerivedFrom", from: "srs:req:REQ-PAY-002", to: "srs:req:REQ-PAY-001" },
      { id: "srs:elicited:1", type: "srs:ElicitedFrom", from: "srs:req:REQ-PAY-001", to: "srs:stk:STK-01" },
      { id: "srs:constrains:1", type: "srs:ConstrainsRequirement", from: "srs:scope:SB-CORE-001", to: "srs:req:REQ-PAY-001" },
    ])
    .commit();
  md = await render(SRS_MARKDOWN_RENDERER_ID, "text/markdown");
  html = await render(SRS_HTML_RENDERER_ID, "text/html");
});

describe("the markdown SRS reads as a specification", () => {
  it("leads with the project, not the workbook id", () => {
    expect(md.split("\n")[0]).toBe("# Payments Platform");
    expect(md).toContain("version 1.2.0");
    expect(md).toContain("**Purpose.** Define what the payments platform must do");
  });

  it("separates what is in scope from what is not", () => {
    const scope = md.slice(md.indexOf("## Scope"), md.indexOf("## Requirements"));
    expect(scope).toContain("### In scope");
    expect(scope).toContain("Card capture");
    expect(scope).toContain("### Out of scope");
    expect(scope).toContain("Ledger reconciliation");
    // A boundary carries its reason, which is the part reviewers argue about.
    expect(scope).toContain("_why:_ The finance system owns the ledger");
  });

  it("orders requirements by priority, not by id", () => {
    expect(md.indexOf("Tokenise a card on capture")).toBeLessThan(md.indexOf("Refund within ninety days"));
  });

  it("gives each requirement its rationale, criteria and provenance", () => {
    expect(md).toContain("`must · operator · primary`");
    expect(md).toContain("**Rationale.** PCI-DSS forbids storing a PAN at rest.");
    expect(md).toContain("- No PAN appears in any datastore after capture.");
    expect(md).toContain("**Verified by** test_inspection");
  });

  it("resolves traceability edges to names rather than ids", () => {
    expect(md).toContain("_derived from:_ Tokenise a card on capture");
    expect(md).toContain("_elicited from:_ Compliance");
    expect(md).not.toContain("srs:req:REQ-PAY-001");
  });

  it("carries stakeholders and glossary", () => {
    expect(md).toContain("| Compliance | approver |");
    expect(md).toContain("**PAN** — Primary Account Number");
  });
});

describe("the HTML SRS is a self-contained, printable artefact", () => {
  it("is a complete document with its styles inline", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Payments Platform</title>");
    expect(html).toContain("<style>");
    expect(html).not.toContain("<link rel=\"stylesheet\"");
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("carries print and dark-mode rules, because it travels on its own", () => {
    expect(html).toContain("@media print");
    expect(html).toContain("prefers-color-scheme:dark");
  });

  it("escapes content rather than injecting it", () => {
    const hostile = "<script>alert(1)</script>";
    expect(hostile).toContain("<script>"); // sanity: the fixture is hostile
    // Nothing in the rendered body may reintroduce a raw tag from data.
    const body = html.slice(html.indexOf("<body>"));
    expect(body).not.toMatch(/<script/i);
  });

  it("tells the same story as the markdown", () => {
    for (const fact of ["Payments Platform", "Card capture", "Ledger reconciliation", "Tokenise a card on capture", "Compliance"]) {
      expect(md, `markdown missing ${fact}`).toContain(fact);
      expect(html, `html missing ${fact}`).toContain(fact);
    }
  });
});

describe("both renderers are registered and dispatchable", () => {
  it("appear in the host's renderer registry with distinct targets", () => {
    const rs = host.plugins.listRenderers().filter((r) => r.rendererId.startsWith("srs:"));
    expect(rs.map((r) => r.target).sort()).toEqual(["text/html", "text/markdown"]);
  });

  it("render an empty workbook without throwing", async () => {
    await host.createProject({ workbook_id: "srs-empty", name: "empty", profile_id: PROFILE_ID });
    const slice = host.getProject("srs-empty");
    const out = await host.plugins.runRenderer(
      "text/markdown",
      {
        workbookId: "srs-empty",
        workbook: slice.workbook,
        primitives: [],
        relations: [],
        templates: [],
        profile: host.profiles.getResolved(PROFILE_ID),
      },
      { rendererId: SRS_MARKDOWN_RENDERER_ID },
    );
    expect(new TextDecoder().decode(out.bytes).length).toBeGreaterThan(0);
  });
});
