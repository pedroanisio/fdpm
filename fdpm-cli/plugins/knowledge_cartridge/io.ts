/**
 * `kc-jsonl` — the format that makes a cartridge portable.
 *
 * A cartridge is sold as a *module*: something you hand to a practitioner who
 * has never read the sources. Without an export path it can only exist inside
 * the workspace that built it, which makes that claim false. This pair is what
 * turns the metaphor into a file.
 *
 * One record per line, `{kind, data}`, filtered to the `kc:` vendor prefix so a
 * mixed workbook exports only its cartridge. The shape matches the `plan-jsonl`
 * and `sw-jsonl` pairs already in this tree.
 *
 * ARCHITECTURAL REQUIREMENT: LLMs will always produce some form of error.
 * Absence of output verification is a design defect, not a runtime bug.
 * All LLM output must be treated as untrusted and validated explicitly.
 *
 * That applies squarely to the importer. A `.kc-jsonl` file is very likely to
 * have been produced, edited or assembled by a model, and the import path is
 * where such a file first meets the system. Two consequences, both deliberate:
 *
 *   - **A malformed line raises.** It is never skipped. Skipping would delete a
 *     claim from a document whose entire contract is that every claim is
 *     accounted for, and it would do so silently — the discard rate on the far
 *     side would still read as clean.
 *   - **The importer does not gate content.** It builds a `ProjectTransfer` and
 *     stops there; every row is then validated by the §7 pipeline on its way
 *     into a workbook, including `kc:val:normative-claim-cited` on the header.
 *     Import is a parse boundary, not a second, weaker validator.
 */
import type {
  PrimitiveInstance,
  ProjectTransfer,
  RelationInstance,
} from "../../src/core/models/instance.js";
import type { ExporterFn, ImporterFn } from "../../src/plugin/types.js";
import { PROFILE_ID, VENDOR } from "./ids.js";

export const KC_JSONL_FORMAT = "kc-jsonl" as const;

const PREFIX = `${VENDOR}:`;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** The default workbook id when the caller supplies none. */
export const KC_DEFAULT_WORKBOOK_ID = "kc-imported" as const;

function decode(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof Uint8Array) return TEXT_DECODER.decode(raw);
  if (raw && typeof raw === "object" && "text" in raw) {
    const t = (raw as { text: unknown }).text;
    if (typeof t === "string") return t;
  }
  throw new Error(`${KC_JSONL_FORMAT}: raw must be string | Uint8Array | { text: string }`);
}

export const kcJsonlExporter: ExporterFn = (transfer) => {
  const lines: string[] = [];
  for (const p of transfer.primitives) {
    if (!p.type_id.startsWith(PREFIX)) continue;
    lines.push(JSON.stringify({ kind: "primitive", data: p }));
  }
  for (const r of transfer.relations) {
    if (!r.type_id.startsWith(PREFIX)) continue;
    lines.push(JSON.stringify({ kind: "relation", data: r }));
  }
  return TEXT_ENCODER.encode(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
};

export const kcJsonlImporter: ImporterFn = (raw, options) => {
  const text = decode(raw);
  const primitives: PrimitiveInstance[] = [];
  const relations: RelationInstance[] = [];

  const lines = text.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let record: { kind?: unknown; data?: unknown };
    try {
      record = JSON.parse(trimmed) as { kind?: unknown; data?: unknown };
    } catch (err) {
      // Line number, not just "parse failed": a 4,000-line cartridge with one
      // bad row is a fixable file, and the operator needs to know which row.
      throw new Error(
        `${KC_JSONL_FORMAT}: line ${i + 1} is not valid JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (record.kind === "primitive") primitives.push(record.data as PrimitiveInstance);
    else if (record.kind === "relation") relations.push(record.data as RelationInstance);
    else {
      throw new Error(
        `${KC_JSONL_FORMAT}: line ${i + 1} has kind ${JSON.stringify(record.kind)}; expected "primitive" or "relation"`,
      );
    }
  }

  const workbookId = options?.workbookId ?? KC_DEFAULT_WORKBOOK_ID;
  const transfer: ProjectTransfer = {
    spec_core: "1.1.0",
    workbook: {
      id: workbookId,
      name: options?.projectName ?? workbookId,
      profile_id: PROFILE_ID,
      created_at: new Date().toISOString(),
      revision: 0,
      ...(options?.projectDescription != null && { description: options.projectDescription }),
    },
    primitives,
    relations,
    templates: [],
    test_suites: [],
  };
  return transfer;
};
