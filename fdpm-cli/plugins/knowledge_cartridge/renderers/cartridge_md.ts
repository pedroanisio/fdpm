/**
 * `kc:CartridgeRenderer` — the artifact itself, as markdown.
 *
 * This is the deliverable the whole profile exists to emit, and its layout is
 * GENERATOR.md Pass 5's "layer type contracts" rather than a house style:
 * L1, L2 and L4 are tables because their contracts say tabular; L3 is a
 * numbered list because the ordering is the content; L5 is the only prose,
 * because it is the only non-executable layer.
 *
 * Two things it does that a summariser would not:
 *
 *   - every normative row carries its `KEY:ordinal` in its own column, so a
 *     reader can check any claim without leaving the page;
 *   - the back matter prints the declared gaps and the unreconciled conflicts.
 *     The gap is a deliverable. A cartridge that renders its rules and hides
 *     what its corpus could not answer is the failure mode the audit pass
 *     exists to prevent.
 */
import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { KC_UNENFORCEABLE_CHECKS } from "../validators.js";
import { buildModel, citationRef, fieldOf, numberOf, type LayerItem } from "./_model.js";
import { T } from "../ids.js";

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function cites(item: LayerItem): string {
  return item.citations.length === 0 ? "—" : item.citations.map(citationRef).join(", ");
}

function table(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ["_(empty)_", ""];
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
    "",
  ];
}

export function renderCartridge(input: RendererInput): RendererOutput {
  const m = buildModel(input.primitives, input.relations);
  const c = m.cartridge;
  const title = c ? fieldOf(c, "cartridge_id") : "(no kc:Cartridge)";
  const out: string[] = [];

  // ── Cover ──────────────────────────────────────────────────────────
  out.push(`# ${title} — ${c ? esc(fieldOf(c, "subject")) : "Untitled cartridge"}`, "");
  if (c) {
    out.push(
      ...table(
        ["", ""],
        [
          ["Archetype", esc(fieldOf(c, "archetype"))],
          ["Substrate", esc(fieldOf(c, "substrate"))],
          ["Snapshot", esc(fieldOf(c, "snapshot_date"))],
          ["Sources", String(m.sources.length)],
        ],
      ),
    );
    out.push(`> ${esc(fieldOf(c, "disclaimer"))}`, "");
  }

  // ── Competence envelope ────────────────────────────────────────────
  out.push("## Competence envelope", "");
  out.push("**Covered**", "");
  for (const e of m.covered) out.push(`- ${esc(fieldOf(e, "statement"))}`);
  out.push("", "**Explicitly excluded**", "");
  if (m.excluded.length === 0) {
    out.push("- _(none declared — the envelope has not been bounded)_");
  } else {
    for (const e of m.excluded) out.push(`- ${esc(fieldOf(e, "statement"))}`);
  }
  out.push("");

  // ── The six layers ─────────────────────────────────────────────────
  for (const layer of m.layers) {
    out.push(`## ${layer.label}`, "");
    if (layer.items.length === 0) {
      out.push("_(empty)_", "");
      continue;
    }
    switch (layer.typeId) {
      case T.Primitive:
        out.push(
          ...table(
            ["Term", "Definition", "Unit", "Source"],
            layer.items.map((i) => [
              esc(fieldOf(i.instance, "term")),
              esc(fieldOf(i.instance, "definition")),
              esc(fieldOf(i.instance, "unit")) || "—",
              cites(i),
            ]),
          ),
        );
        break;
      case T.Invariant:
        out.push(
          ...table(
            ["ID", "Rule", "Value", "Violated by", "Source"],
            layer.items.map((i) => [
              `\`${i.instance.id}\``,
              esc(fieldOf(i.instance, "rule")),
              esc(fieldOf(i.instance, "value")),
              esc(fieldOf(i.instance, "falsifier")),
              cites(i),
            ]),
          ),
        );
        break;
      case T.Constant:
        out.push(
          ...table(
            ["Quantity", "Value", "Unit", "Source"],
            layer.items.map((i) => [
              esc(fieldOf(i.instance, "name")),
              `\`${esc(fieldOf(i.instance, "value"))}\``,
              esc(fieldOf(i.instance, "unit")),
              cites(i),
            ]),
          ),
        );
        break;
      case T.Step: {
        const ordered = layer.items
          .slice()
          .sort((a, b) => numberOf(a.instance, "position") - numberOf(b.instance, "position"));
        for (const i of ordered) {
          out.push(
            `${numberOf(i.instance, "position")}. **${esc(fieldOf(i.instance, "action"))}** — ${esc(
              fieldOf(i.instance, "constrains_next"),
            )} _(${cites(i)})_`,
          );
        }
        out.push("");
        break;
      }
      case T.Diagnostic:
        out.push(
          ...table(
            ["Symptom", "Cause", "Correction", "Source"],
            layer.items.map((i) => [
              esc(fieldOf(i.instance, "symptom")),
              esc(fieldOf(i.instance, "cause")),
              esc(fieldOf(i.instance, "correction")),
              cites(i),
            ]),
          ),
        );
        break;
      case T.Override:
        for (const i of layer.items) {
          const targets = m.overrideTargets.get(i.instance.id) ?? [];
          const suspends = targets.length ? targets.map((t) => `\`${t}\``).join(", ") : "_nothing_";
          out.push(
            `- **${esc(fieldOf(i.instance, "condition"))}** — ${esc(
              fieldOf(i.instance, "rationale"),
            )} (suspends ${suspends})`,
          );
        }
        out.push("");
        break;
      default:
        break;
    }
  }

  // ── Back matter ────────────────────────────────────────────────────
  out.push("## Declared gaps", "");
  if (m.gaps.length === 0) {
    out.push("_(none declared)_", "");
  } else {
    out.push(
      ...table(
        ["Gap", "Why unbacked", "Grade"],
        m.gaps.map((g) => [
          esc(fieldOf(g, "statement")),
          esc(fieldOf(g, "why_unbacked")),
          esc(fieldOf(g, "grade")),
        ]),
      ),
    );
  }

  out.push("## Unreconciled conflicts", "");
  if (m.conflicts.length === 0) {
    out.push("_(none recorded)_", "");
  } else {
    out.push(
      ...table(
        ["Quantity", "Source A", "Says", "Source B", "Says"],
        m.conflicts.map((k) => [
          esc(fieldOf(k, "quantity")),
          `\`${esc(fieldOf(k, "key_a"))}\``,
          esc(fieldOf(k, "value_a")),
          `\`${esc(fieldOf(k, "key_b"))}\``,
          esc(fieldOf(k, "value_b")),
        ]),
      ),
    );
  }

  out.push("## Corpus", "");
  out.push(
    ...table(
      ["KEY", "Tier", "Title", "Sentences"],
      m.sources.map((s) => [
        `\`${esc(fieldOf(s, "citation_key"))}\``,
        esc(fieldOf(s, "tier")),
        esc(fieldOf(s, "title")),
        String(numberOf(s, "sentence_count") || "—"),
      ]),
    ),
  );

  out.push("## Construction record", "");
  const h = m.harvest;
  out.push(
    ...table(
      ["", ""],
      [
        ["Harvested passages", String(h.total)],
        ["Retained", String(h.retained)],
        ["Discarded", String(h.discarded)],
        ["Discard rate", h.discardRate === null ? "—" : `${(h.discardRate * 100).toFixed(0)}%`],
        ["Uncited normative claims", String(m.uncited.length)],
        [
          "Source token estimate",
          c && numberOf(c, "source_token_estimate") ? String(numberOf(c, "source_token_estimate")) : "—",
        ],
      ],
    ),
  );

  out.push("### Checks this render cannot make", "");
  for (const check of KC_UNENFORCEABLE_CHECKS) {
    out.push(`- **${check.check}** — ${check.why}`);
  }
  out.push("");

  return {
    bytes: new TextEncoder().encode(out.join("\n")),
    contentType: "text/markdown",
    filename: `${title || "cartridge"}.md`,
  };
}
