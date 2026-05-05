import type {
  RendererFn,
  RendererOutput,
} from "../../../src/plugin/types.js";
import {
  buildDocumentTreeAuto,
  fieldRows,
  formatCitation,
  typeLabel,
  type SectionBlock,
} from "./_common.js";
import type { PrimitiveInstance } from "../../../src/core/models/instance.js";
import type { DomainProfile } from "../../../src/core/models/meta.js";

/**
 * `text/markdown` renderer for the formal_specification profile.
 *
 * Layout:
 *   # <workbook_id>                        (front matter)
 *   ---
 *   ## 1. <Section title>
 *   <description>
 *
 *   ### <Type label> — <primitive id>
 *   - <field>: <value>
 *
 *   ## Bibliography
 *   - <citation>
 */
export const renderMarkdown: RendererFn = (input): RendererOutput => {
  const tree = buildDocumentTreeAuto(input);
  const lines: string[] = [];

  lines.push(`# ${tree.workbook_id}`);
  lines.push("");
  lines.push(`> Profile: \`${tree.profile.id}\` v${tree.profile.version}`);
  lines.push("");

  for (const f of tree.findings) {
    lines.push(`> [!WARNING]`);
    lines.push(`> ${f.message}`);
    lines.push("");
  }

  for (const block of tree.sections) {
    appendSectionMd(lines, block, tree.profile);
  }

  if (tree.unsectioned.length > 0) {
    lines.push("");
    lines.push(`## Appendix — Unsectioned`);
    lines.push("");
    lines.push(
      "_Primitives not anchored to any section via `fs:ContainedIn` or matching `scope_id`._",
    );
    lines.push("");
    for (const p of tree.unsectioned) appendPrimitiveMd(lines, p, tree.profile);
  }

  if (tree.citations.length > 0) {
    lines.push("");
    lines.push("## Bibliography");
    lines.push("");
    for (const c of tree.citations) {
      lines.push(`- **[${c.field_values["key"] ?? c.id}]** ${formatCitation(c)}`);
    }
    lines.push("");
  }

  const text = lines.join("\n");
  return {
    bytes: new TextEncoder().encode(text),
    contentType: "text/markdown",
    filename: `${tree.workbook_id}.md`,
    ...(tree.findings.length > 0 ? { findings: tree.findings } : {}),
  };
};

function appendSectionMd(
  lines: string[],
  block: SectionBlock,
  profile: DomainProfile,
): void {
  lines.push("");
  lines.push(`## ${block.number}. ${block.title}`);
  if (block.status) lines.push(`_status: ${block.status}_`);
  lines.push("");
  if (block.description) {
    lines.push(block.description);
    lines.push("");
  }
  if (block.primitives.length === 0) return;
  for (const p of block.primitives) appendPrimitiveMd(lines, p, profile);
}

function appendPrimitiveMd(
  lines: string[],
  p: PrimitiveInstance,
  profile: DomainProfile,
): void {
  lines.push(`### ${typeLabel(p.type_id, profile)} — \`${p.id}\``);
  lines.push("");
  for (const row of fieldRows(p, profile)) {
    const value = row.value.includes("\n")
      ? `\n\n\`\`\`\n${row.value}\n\`\`\`\n`
      : ` ${row.value}`;
    lines.push(`- **${row.name}**:${value}`);
  }
  lines.push("");
}
