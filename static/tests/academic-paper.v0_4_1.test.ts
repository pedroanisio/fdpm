/**
 * Regression tests for academic-paper.ts v0.4.1.
 *
 * Verifies the two new transitive cycle blocks added to bring the TS
 * schema into parity with the rev3 SHACL fix patch:
 *
 *   - Claim.supersededBy        (block 8)
 *   - Quotation.translatedFrom  (block 9, plus per-record self-loop)
 *
 * Self-contained runner — execute with:
 *
 *   NODE_PATH=fdpm-cli/node_modules \
 *     tsx static/tests/academic-paper.v0_4_1.test.ts
 *
 * Each test builds a minimal valid AcademicPaper, mutates one field,
 * then asserts the expected issue fires (or not).
 */

import assert from "node:assert/strict";
import {
  RefinedAcademicPaperSchema,
  META_ROOT_VALUE,
} from "../schemas/academic-paper-v0_4_1.ts";

// ---------------------------------------------------------------------------
// Minimal valid base. The smallest AcademicPaper that passes both the
// per-primitive schemas and RefinedAcademicPaperSchema's referential
// integrity. Method='descriptive' is chosen because it triggers neither
// the empirical / theoretical / literary-critical / review / historical
// conditional rules.
// ---------------------------------------------------------------------------

function makeBase() {
  return {
    _meta: META_ROOT_VALUE,
    paper: {
      id: "paper-x",
      title: "Test paper",
      language: "en",
      epistemicMethod: "descriptive",
      format: "article",
      year: 2026,
      keywords: [],
    },
    authors: [
      {
        id: "author-a",
        paper: "paper-x",
        fullName: "Test Author",
        familyName: "Author",
        affiliations: ["affil-x"],
        contributions: [],
      },
    ],
    affiliations: [{ id: "affil-x", institution: "Test Institution" }],
    sections: [
      {
        id: "section-x",
        paper: "paper-x",
        label: "1",
        title: "Section",
        order: 0,
      },
    ],
    claims: [],
    evidence: [],
    quotations: [],
    works: [],
    concepts: [],
    definitions: [],
    theorists: [],
    theories: [],
    methods: [],
    findings: [],
    limitations: [],
    footnotes: [],
    equations: [],
    figures: [],
    citations: [],
    fundings: [],
    funders: [],
    tables: [],
    paperRelations: [],
    errata: [],
  };
}

function parse(payload: ReturnType<typeof makeBase>) {
  return RefinedAcademicPaperSchema.safeParse(payload);
}

function expectIssueMatching(
  result: ReturnType<typeof parse>,
  fragment: string,
): void {
  if (result.success) {
    throw new assert.AssertionError({
      message: `expected validation failure containing '${fragment}', but parse succeeded`,
    });
  }
  const messages = result.error.issues.map((i) => i.message);
  const hit = messages.some((m) => m.includes(fragment));
  if (!hit) {
    throw new assert.AssertionError({
      message:
        `expected an issue containing '${fragment}', got:\n  ` +
        messages.map((m) => `- ${m}`).join("\n  "),
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function test_base_validates_cleanly() {
  const r = parse(makeBase());
  assert.equal(
    r.success,
    true,
    r.success ? "" : JSON.stringify(r.error.issues, null, 2),
  );
}

function test_claim_supersededby_self_loop_rejected() {
  // Pre-existing v0.4 rule: Claim.supersededBy === Claim.id is rejected.
  const base = makeBase();
  base.claims = [
    {
      id: "claim-a",
      paper: "paper-x",
      section: "section-x",
      kind: "descriptive",
      statement: "A",
      derivesFrom: [],
      counterReads: [],
      lifecycleStatus: "asserted",
      supersededBy: "claim-a",
    },
  ] as any;
  expectIssueMatching(parse(base), "may not reference itself");
}

function test_claim_supersededby_transitive_cycle_rejected() {
  // NEW v0.4.1: A→B→A cycle must trigger the transitive cycle block.
  const base = makeBase();
  base.claims = [
    {
      id: "claim-a",
      paper: "paper-x",
      section: "section-x",
      kind: "descriptive",
      statement: "A",
      derivesFrom: [],
      counterReads: [],
      lifecycleStatus: "asserted",
      supersededBy: "claim-b",
    },
    {
      id: "claim-b",
      paper: "paper-x",
      section: "section-x",
      kind: "descriptive",
      statement: "B",
      derivesFrom: [],
      counterReads: [],
      lifecycleStatus: "asserted",
      supersededBy: "claim-a",
    },
  ] as any;
  expectIssueMatching(parse(base), "cycle detected in claims.supersededBy");
}

function test_quotation_translatedfrom_self_loop_rejected() {
  // NEW v0.4.1: per-record loop now rejects translatedFrom === id.
  const base = makeBase();
  base.works = [
    { id: "work-x", kind: "book", title: "W", authorsFreeText: [] },
  ] as any;
  base.quotations = [
    {
      id: "quote-a",
      paper: "paper-x",
      quotesFrom: "work-x",
      locator: "p.1",
      body: "X",
      bodyLanguage: "en",
      emphasis: "none",
      omissionsPresent: false,
      translatedFrom: "quote-a",
    },
  ] as any;
  expectIssueMatching(
    parse(base),
    "Quotation cannot be a translation of itself",
  );
}

function test_quotation_translatedfrom_transitive_cycle_rejected() {
  // NEW v0.4.1: A↔B cycle on translatedFrom.
  const base = makeBase();
  base.works = [
    { id: "work-x", kind: "book", title: "W", authorsFreeText: [] },
  ] as any;
  base.quotations = [
    {
      id: "quote-a",
      paper: "paper-x",
      quotesFrom: "work-x",
      locator: "p.1",
      body: "A",
      bodyLanguage: "en",
      emphasis: "none",
      omissionsPresent: false,
      translatedFrom: "quote-b",
    },
    {
      id: "quote-b",
      paper: "paper-x",
      quotesFrom: "work-x",
      locator: "p.2",
      body: "B",
      bodyLanguage: "en",
      emphasis: "none",
      omissionsPresent: false,
      translatedFrom: "quote-a",
    },
  ] as any;
  expectIssueMatching(
    parse(base),
    "cycle detected in quotations.translatedFrom",
  );
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const tests: Array<readonly [string, () => void]> = [
  ["base validates cleanly", test_base_validates_cleanly],
  ["claim.supersededBy self-loop", test_claim_supersededby_self_loop_rejected],
  [
    "claim.supersededBy transitive cycle (v0.4.1)",
    test_claim_supersededby_transitive_cycle_rejected,
  ],
  [
    "quotation.translatedFrom self-loop (v0.4.1)",
    test_quotation_translatedfrom_self_loop_rejected,
  ],
  [
    "quotation.translatedFrom transitive cycle (v0.4.1)",
    test_quotation_translatedfrom_transitive_cycle_rejected,
  ],
];

let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ok   — ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  FAIL — ${name}`);
    console.error(err instanceof Error ? err.message : err);
    failed += 1;
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
