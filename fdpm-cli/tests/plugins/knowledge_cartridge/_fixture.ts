/**
 * A small but complete cartridge, built through the real Host so that every
 * row in it has passed the same validation gate a real one would.
 *
 * Deliberately parameterised on the four things Pass 6 counts — diagnostics,
 * overrides, exclusions, and the harvest retained/discarded split — because
 * the interesting tests are the ones that push a single count below its floor
 * and assert the finding. Defaults produce a cartridge that validates clean at
 * both error and warning level; every knob turns exactly one check red.
 *
 * The content is real typography drawn from the worked example the generator
 * document cites (TC-TYP-001), not lorem: a fixture whose invariants are
 * nonsense cannot exercise a validator that asks whether an invariant is
 * falsifiable.
 */
import type { Host } from "../../../src/core/host.js";
import { PROFILE_ID, R, T } from "../../../plugins/knowledge_cartridge/ids.js";

export interface SeedOptions {
  /** L4 rows. Below 8 trips kc:val:diagnostic-minimum. */
  diagnostics?: number;
  /** L5 rows. 0 trips kc:val:judgement-non-empty. */
  overrides?: number;
  /** Excluded envelope items. 0 trips kc:val:exclusions-non-empty. */
  exclusions?: number;
  /** Retained harvest rows. */
  harvestKept?: number;
  /** Discarded harvest rows. Below half the total trips kc:val:discard-rate. */
  harvestDiscarded?: number;
}

const DIAGNOSTICS: Array<[string, string, string]> = [
  ["Rivers of white running down justified text.", "Measure too narrow for the average word length.", "Widen the measure or set ragged right."],
  ["The page looks grey and undifferentiated.", "Type size, leading and measure are all at their defaults.", "Change one of the three; hierarchy needs one clear step."],
  ["Lines are hard to track back to the left margin.", "Leading too tight for the measure.", "Add leading proportionally as the measure widens."],
  ["Headings float without attaching to their section.", "Equal space above and below the heading.", "Give more space above than below."],
  ["Numerals disrupt the colour of running text.", "Lining figures set in prose.", "Use old-style figures in body text."],
  ["Small caps look weak beside the roman.", "Faked small caps scaled from full capitals.", "Use a true small-cap font or increase weight."],
  ["Word spacing varies visibly line to line.", "Justification with too few hyphenation opportunities.", "Enable hyphenation or loosen the justification bounds."],
  ["The first line of a paragraph is over-indented.", "Indent set from a default rather than the measure.", "Set the indent to one em, or to the leading."],
  ["Widows and orphans appear at page breaks.", "No break control on paragraphs.", "Set minimum lines before and after a break."],
  ["Captions compete with body text for attention.", "Caption set at the same size and weight as the body.", "Reduce size or change style so the caption reads as subordinate."],
];

const OVERRIDES: Array<[string, string]> = [
  ["The house style sheet fixes the measure.", "A client's contracted style outranks a typographic default."],
  ["The text is a table of figures, not prose.", "Measure guidance is derived from reading prose and does not transfer to tabular matter."],
];

export async function seedCartridge(
  host: Host,
  workbookId: string,
  opts: SeedOptions = {},
): Promise<{ workbookId: string }> {
  const diagnostics = opts.diagnostics ?? 8;
  const overrides = opts.overrides ?? 2;
  const exclusions = opts.exclusions ?? 2;
  const harvestKept = opts.harvestKept ?? 3;
  const harvestDiscarded = opts.harvestDiscarded ?? 7;

  await host.createProject({
    workbook_id: workbookId,
    name: "Typesetting cartridge (fixture)",
    profile_id: PROFILE_ID,
  });

  const create = async (
    id: string,
    typeId: string,
    fields: Record<string, unknown>,
  ): Promise<void> => {
    const out = await host.createPrimitive(workbookId, { id, type_id: typeId, field_values: fields });
    if (!out.report.accepted) {
      throw new Error(`fixture rejected ${id}: ${JSON.stringify(out.report.findings)}`);
    }
  };
  const link = async (
    id: string,
    typeId: string,
    from: string,
    to: string,
    fields: Record<string, unknown> = {},
  ): Promise<void> => {
    const out = await host.createRelation(workbookId, {
      id,
      type_id: typeId,
      source_id: from,
      target_id: to,
      field_values: fields,
    });
    if (!out.report.accepted) {
      throw new Error(`fixture rejected edge ${id}: ${JSON.stringify(out.report.findings)}`);
    }
  };

  // Corpus first — every layer item needs a source to cite.
  await create("kc:source:bringhurst", T.Source, {
    citation_key: "BRING",
    title: "The Elements of Typographic Style",
    tier: "primary",
    sentence_count: 4200,
    edition_date: "2004",
  });
  await create("kc:source:hochuli", T.Source, {
    citation_key: "HOCH",
    title: "Detail in Typography",
    tier: "practitioner",
    sentence_count: 900,
  });

  // Envelope. Covered items first, then the exclusions the knob controls.
  await create("kc:envelope:covered-prose", T.EnvelopeItem, {
    disposition: "covered",
    statement: "Setting continuous prose for print: measure, leading, size and hierarchy.",
  });
  for (let i = 0; i < exclusions; i += 1) {
    await create(`kc:envelope:excluded-${i}`, T.EnvelopeItem, {
      disposition: "excluded",
      statement: i === 0 ? "Type design and font engineering." : "Screen and variable-font typography.",
    });
  }

  // Harvest, both arms.
  for (let i = 0; i < harvestKept; i += 1) {
    await create(`kc:harvest:kept-${i}`, T.Harvest, {
      citation_key: "BRING",
      ordinal: 400 + i,
      verbatim: "Anything from 45 to 75 characters is widely regarded as a satisfactory length of line.",
      probe: "quantity",
      retained: true,
    });
  }
  for (let i = 0; i < harvestDiscarded; i += 1) {
    await create(`kc:harvest:dropped-${i}`, T.Harvest, {
      citation_key: "BRING",
      ordinal: 900 + i,
      verbatim: "The history of the roman letterform begins with the inscriptional capitals of Rome.",
      probe: "constraint",
      retained: false,
      discard_reason: "History. Transposes into none of the five arms.",
    });
  }

  // L0–L3.
  await create("kc:primitive:measure", T.Primitive, {
    term: "Measure",
    definition: "The length of a line of type, counted in characters.",
    unit: "characters",
  });
  await create("kc:invariant:measure", T.Invariant, {
    rule: "Keep the measure between 45 and 75 characters for continuous prose.",
    value: "45-75 characters",
    falsifier: "A single-column body text measuring 110 characters at 10pt.",
  });
  await create("kc:constant:leading", T.Constant, {
    name: "Default leading",
    value: "1.2",
    unit: "multiple of type size",
  });
  await create("kc:step:set-measure", T.Step, {
    position: 1,
    action: "Choose the measure before the type size.",
    constrains_next: "Leading is derived from the measure, so the measure must be fixed first.",
    procedure: "Setting a text page",
  });

  // L4, count-controlled.
  for (let i = 0; i < diagnostics; i += 1) {
    const [symptom, cause, correction] = DIAGNOSTICS[i % DIAGNOSTICS.length]!;
    await create(`kc:diagnostic:d${i}`, T.Diagnostic, { symptom, cause, correction });
  }

  // L5, count-controlled. Each is wired to the invariant it suspends.
  for (let i = 0; i < overrides; i += 1) {
    const [condition, rationale] = OVERRIDES[i % OVERRIDES.length]!;
    await create(`kc:override:o${i}`, T.Override, { condition, rationale });
    await link(`kc:ov-edge-${i}`, R.OverridesInvariant, `kc:override:o${i}`, "kc:invariant:measure");
  }

  // Citations for every normative claim. L5 is exempt by design.
  const cited: Array<[string, string, number]> = [
    ["kc:primitive:measure", "kc:source:bringhurst", 12],
    ["kc:invariant:measure", "kc:source:bringhurst", 424],
    ["kc:constant:leading", "kc:source:bringhurst", 431],
    ["kc:step:set-measure", "kc:source:hochuli", 88],
  ];
  for (const [i, [from, to, ordinal]] of cited.entries()) {
    // Index, not a slug off the id: kc:primitive:measure and
    // kc:invariant:measure share a last segment and would collide.
    await link(`kc:cite-l${i}`, R.CitesSource, from, to, { ordinal });
  }
  for (let i = 0; i < diagnostics; i += 1) {
    await link(`kc:cite-d${i}`, R.CitesSource, `kc:diagnostic:d${i}`, "kc:source:hochuli", {
      ordinal: 100 + i,
    });
  }

  // Audit output.
  await create("kc:gap:variable-fonts", T.Gap, {
    statement: "Optical sizing in variable fonts.",
    why_unbacked: "The primary source is a 2004 edition and predates the format; no practitioner-tier source in the corpus covers it.",
    grade: "decision",
  });
  await link("kc:gap-edge-1", R.GapOnEnvelopeItem, "kc:gap:variable-fonts", "kc:envelope:covered-prose");

  await create("kc:conflict:leading", T.Conflict, {
    quantity: "Default leading for continuous prose",
    key_a: "BRING",
    value_a: "1.2 times the type size",
    key_b: "HOCH",
    value_b: "Between 1.2 and 1.5, depending on the measure",
  });
  await link("kc:conf-a", R.ConflictBetweenSources, "kc:conflict:leading", "kc:source:bringhurst");
  await link("kc:conf-b", R.ConflictBetweenSources, "kc:conflict:leading", "kc:source:hochuli");

  await create("kc:defect:title", T.CorpusDefect, {
    kind: "metadata_failure",
    signal: "A corpus document held under a bare numeric title.",
    fix: "Repair the title before anyone else searches.",
    grade: "low",
  });
  await link("kc:defect-edge", R.DefectOnSource, "kc:defect:title", "kc:source:hochuli");

  // The header goes last: its validator counts everything above it.
  await create("kc:cartridge:typesetting", T.Cartridge, {
    cartridge_id: "TC-TYP-001",
    subject: "Typesetting and typographic composition",
    archetype: "A book typographer setting continuous prose for print",
    substrate: "doc-ray",
    snapshot_date: "2026-08-30",
    source_token_estimate: 250000,
    disclaimer:
      "Paraphrase, not quotation. Defaults are starting positions, not tolerances. Unreviewed by a domain expert.",
  });

  return { workbookId };
}
