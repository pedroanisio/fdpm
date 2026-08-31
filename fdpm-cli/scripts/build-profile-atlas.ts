/**
 * Generates `docs/architecture/PROFILES.md` — the atlas of every
 * `DomainProfile` this repository ships.
 *
 * Why this is generated rather than written: the same reason
 * `build-arch-census.ts` exists. A profile overview is almost entirely
 * counts and identifiers — type counts, rule ids, renderer targets, extends
 * chains — and every one of them moves when a plugin does. Twenty-one
 * profiles across twenty plugins is more hand-typed facts than any reviewer
 * will re-check, so a hand-written atlas is wrong within a release and
 * nobody notices. `tests/_meta/doc-drift.test.ts` runs this with `--check`
 * and fails the build when the committed artifact and a regeneration
 * disagree.
 *
 * EVERYTHING COMES FROM THE HOST, not from the manifests on disk and not
 * from importing plugin modules. `PluginRecord.contributions` is what the
 * loader actually registered: the profile ids a plugin owns, the rule ids
 * its validators answer to, the renderer ids and their targets, the
 * importer/exporter formats, the expression helpers, the transformers. A
 * manifest can declare a capability whose code never registers; the
 * contributions record cannot. Prompts are only visible here — an MCP
 * prompt is registered through `ctx.registerPrompt` and has no manifest
 * capability entry at all.
 *
 * TWO FILTERS, both load-bearing for the `--check` gate:
 *
 *   - `dataDir: null`. A real data directory can hold profiles registered
 *     at runtime through `fdpm.profile.register`. Those belong to whoever
 *     ran the command, not to this repository.
 *   - Plugins rooted under this checkout's `plugins/`. The loader also
 *     discovers user-installed plugins from `~/.fdpm/plugins`, and one is
 *     installed on at least one developer machine today. Either source
 *     would make the atlas a function of the machine it ran on and the
 *     `--check` gate unsatisfiable on every other checkout — the same
 *     defect `build-arch-census.ts` had when it counted the working tree
 *     instead of the index.
 *
 * `listRaw` gives a profile as its plugin declared it; `getResolved` gives
 * it after `extends` is applied, which is why a derived profile reports
 * more types than its own file defines. Both are shown, because the
 * difference is the whole point of a derived profile.
 *
 * No network, no wall clock, no git. Run with
 * `npx tsx scripts/build-profile-atlas.ts`; pass `--check` to verify
 * without writing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { openHost } from "../src/sdk.js";
import type { DomainProfile } from "../src/core/models/meta.js";

const CLI_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(CLI_ROOT, "..");
const PLUGINS_ROOT = join(CLI_ROOT, "plugins") + sep;
const OUT_PATH = join(REPO_ROOT, "docs/architecture/PROFILES.md");

// ── The slices of the host's records this script reads ────────────────

interface Contributions {
  profileIds: string[];
  validators: Array<{ type_id: string; rule_id: string }>;
  renderers: Array<{ target: string; rendererId: string }>;
  prompts: Array<{ promptId: string }>;
  exprHelpers: Array<{ helperId: string }>;
  transformers: Array<{ name: string }>;
  importers: Array<{ format: string }>;
  exporters: Array<{ format: string }>;
}

interface Plugin {
  id: string;
  version: string;
  /** Directory under `plugins/`, which is how a reader finds it. */
  dir: string;
  description: string;
  contributions: Contributions;
}

// ── Rendering helpers ─────────────────────────────────────────────────

/** Markdown table cells cannot hold a raw pipe or newline. */
function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * SPEC-PLUGIN-NAMING §5.5.1: a profile id's version tail MUST be exactly
 * `<major>.<minor>`.
 *
 * The tail names a compatibility series, not a release. It moves only when the
 * type catalogue changes in a way existing workbooks cannot survive, because
 * the id is recorded in every workbook's `workbook.create` operation and that
 * log is append-only — changing an id orphans every log that names it, and the
 * host has no profile-id migration.
 *
 * So a tail that disagrees with `version` is expected, not a defect: it means
 * the catalogue grew compatibly since the series began. Only a malformed tail
 * is reported. `tests/_meta/profile-contract.test.ts` gates the same rule.
 */
function idTailDefect(id: string): string | null {
  if (!id.startsWith("profile:")) return null; // `core:empty` is not one.
  const tail = id.slice(id.lastIndexOf(":") + 1);
  if (/^\d+\.\d+$/.test(tail)) return null;
  return tail.split(".").length > 2
    ? `tail \`${tail}\` carries a patch segment; §5.5.1 requires exactly \`<major>.<minor>\``
    : `tail \`${tail}\` is not a \`<major>.<minor>\` pair`;
}

/** Collapse to one line and cap, so a long description stays readable. */
function brief(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}

function code(xs: readonly string[]): string {
  return xs.map((x) => `\`${x}\``).join(", ");
}

interface Row {
  id: string;
  version: string;
  label: string;
  /** The profile's own description, or "" when it declares none. */
  ownDescription: string;
  /** What the document shows: own description, else the plugin's. */
  shownDescription: string;
  extendsIds: string[];
  /** Resolved — after `extends` is applied. */
  primitives: number;
  relations: number;
  categories: number;
  scopes: number;
  rules: number;
  templates: number;
  /** Declared by the profile's own file, before inheritance. */
  ownPrimitives: number;
  ownRelations: number;
  plugin: Plugin | null;
}

/**
 * The capability lines under one profile.
 *
 * Rule ids rather than local names: a rule id is what a validation finding
 * carries, so it is the string a reader will be holding when they come
 * looking for where it came from.
 */
function capabilityLines(p: Plugin): string[] {
  const c = p.contributions;
  const lines: string[] = [];

  if (c.renderers.length > 0) {
    const rs = c.renderers.map((r) => `\`${r.rendererId}\` → ${r.target}`);
    lines.push(`- **Renderers (${c.renderers.length}):** ${rs.join(", ")}`);
  }

  if (c.validators.length > 0) {
    const ids = [...new Set(c.validators.map((v) => v.rule_id))].sort();
    // uixo registers 712 validators; listing them would drown the document.
    lines.push(
      `- **Validators (${c.validators.length}, ${plural(ids.length, "distinct rule id")}):** ` +
        (ids.length <= 12 ? code(ids) : `see \`plugins/${p.dir}/fdpm-plugin.json\``),
    );
  }

  if (c.importers.length > 0) lines.push(`- **Importers:** ${code(c.importers.map((i) => i.format))}`);
  if (c.exporters.length > 0) lines.push(`- **Exporters:** ${code(c.exporters.map((e) => e.format))}`);
  if (c.transformers.length > 0)
    lines.push(`- **Transformers:** ${code(c.transformers.map((t) => t.name))}`);
  if (c.exprHelpers.length > 0)
    lines.push(`- **Expression helpers:** ${code(c.exprHelpers.map((h) => h.helperId))}`);
  if (c.prompts.length > 0)
    lines.push(`- **MCP prompts:** ${code(c.prompts.map((x) => x.promptId))}`);

  return lines;
}

// ── Main ──────────────────────────────────────────────────────────────

async function build(): Promise<string> {
  const host = await openHost({ dataDir: null });

  const plugins: Plugin[] = [];
  const byProfileId = new Map<string, Plugin>();
  for (const rec of host.plugins.list()) {
    const r = rec as unknown as {
      id: string;
      version: string;
      source: { root: string };
      manifest: { description?: string };
      contributions: Contributions;
    };
    // Repo-shipped only — see the header note on `--check`.
    if (!r.source.root.startsWith(PLUGINS_ROOT)) continue;
    const plugin: Plugin = {
      id: r.id,
      version: r.version,
      dir: r.source.root.slice(PLUGINS_ROOT.length),
      description: r.manifest.description ?? "",
      contributions: r.contributions,
    };
    plugins.push(plugin);
    for (const pid of plugin.contributions.profileIds) byProfileId.set(pid, plugin);
  }
  plugins.sort((a, b) => (a.dir < b.dir ? -1 : 1));

  const rows: Row[] = [];
  for (const raw of host.profiles.listRaw() as DomainProfile[]) {
    const plugin = byProfileId.get(raw.id) ?? null;
    // A profile owned by a plugin outside this checkout is not ours to
    // document. `core:empty` has no plugin and is kept deliberately.
    if (plugin === null && raw.id !== "core:empty") continue;
    const resolved = host.profiles.getResolved(raw.id);
    const ownDescription = raw.description ?? "";
    rows.push({
      id: raw.id,
      version: raw.version,
      label: raw.label ?? raw.name ?? raw.id,
      ownDescription,
      shownDescription: ownDescription !== "" ? ownDescription : (plugin?.description ?? ""),
      extendsIds: raw.extends ?? [],
      primitives: resolved.primitive_types.length,
      relations: resolved.relation_types.length,
      categories: resolved.categories.length,
      scopes: resolved.scopes.length,
      rules: resolved.validation_rules.length,
      templates: resolved.templates.length,
      ownPrimitives: raw.primitive_types.length,
      ownRelations: raw.relation_types.length,
      plugin,
    });
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const derived = rows.filter((r) => r.extendsIds.length > 0);
  const base = rows.filter((r) => r.extendsIds.length === 0);
  const noOwnDescription = rows.filter((r) => r.ownDescription === "");
  const noDescriptionAtAll = rows.filter((r) => r.shownDescription === "");
  const idDefects = rows
    .map((r) => ({ id: r.id, note: idTailDefect(r.id) }))
    .filter((x): x is { id: string; note: string } => x.note !== null);
  // Expected under §5.5.1, shown so a reader does not mistake it for drift.
  const tailBehindVersion = rows.filter((r) => {
    if (!r.id.startsWith("profile:")) return false;
    const tail = r.id.slice(r.id.lastIndexOf(":") + 1);
    const [major, minor] = r.version.split(".");
    return /^\d+\.\d+$/.test(tail) && tail !== `${major}.${minor}`;
  });

  // Base profiles only: a derived profile's types are its parents', and
  // counting them again would double every inherited type.
  const totalPrimitives = base.reduce((n, r) => n + r.ownPrimitives, 0);
  const totalRelations = base.reduce((n, r) => n + r.ownRelations, 0);
  const totalRules = base.reduce((n, r) => n + r.rules, 0);
  const totalValidators = plugins.reduce((n, p) => n + p.contributions.validators.length, 0);
  const totalRenderers = plugins.reduce((n, p) => n + p.contributions.renderers.length, 0);
  const totalPrompts = plugins.reduce((n, p) => n + p.contributions.prompts.length, 0);

  const L: string[] = [];
  const push = (...xs: string[]): void => {
    L.push(...xs);
  };

  push(
    "---",
    "disclaimer:",
    "  notice: >-",
    "    No information within this document should be taken for granted.",
    "    Any statement or premise not backed by a real logical definition",
    "    or verifiable reference may be invalid, erroneous, or a hallucination.",
    '  generated_by: "fdpm-cli/scripts/build-profile-atlas.ts"',
    "---",
    "",
    "<!-- GENERATED FILE — DO NOT EDIT.",
    "     Source: fdpm-cli/scripts/build-profile-atlas.ts",
    "     Regenerate: npx tsx scripts/build-profile-atlas.ts",
    "     Gate: fdpm-cli/tests/_meta/doc-drift.test.ts runs it with --check. -->",
    "",
    "# Profile atlas",
    "",
    "## Disclaimer",
    "",
    "This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).",
    "> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.",
    "",
    "Every `DomainProfile` this repository ships. Counts and identifiers are read",
    "from the running host — the profile registry and each plugin's registered",
    "contributions — not from the manifests on disk and not typed by hand.",
    "",
    "## What a profile is",
    "",
    "A profile is the schema a workbook is validated against: the closed set of",
    "primitive types and relation types that workbook may contain, the fields",
    "each type requires, the categories and scopes that organise them, and the",
    "validation rules a write must satisfy. A workbook names one profile when it",
    "is created and cannot change it afterwards: of the closed set of operation",
    "kinds in `src/core/operations/kinds.ts`, `profile_id` appears in exactly one",
    "payload — `ProjectCreatePayload` — and payloads are `.strict()`, so no",
    "operation exists that could rewrite it.",
    "",
    "A profile may `extend` others. The registry resolves the chain at",
    "registration, rejecting cycles and id collisions, so a derived profile",
    "resolves to the union of its own types and its parents'. **Resolved** counts",
    "below are post-inheritance — what a workbook is actually checked against.",
    "**Own** counts are what the profile's own file declares.",
    "",
    "A profile is not the whole story. The plugin that ships it usually also",
    "registers validators (rules the profile file cannot express), renderers",
    "(how a workbook becomes a document), importers and exporters, expression",
    "helpers, and MCP prompts. Those are listed per profile below, because in",
    "practice they are what makes a profile usable.",
    "",
    "## Inventory",
    "",
    `${rows.length} profiles from ${plugins.length} repository plugins: ${base.length} base and`,
    `${derived.length} derived. Together they register ${totalValidators} validators,`,
    `${totalRenderers} renderers and ${totalPrompts} MCP prompts.`,
    "",
    "| Profile | Version | Prim. | Rel. | Rules | Extends | Shipped by |",
    "| --- | --- | ---: | ---: | ---: | --- | --- |",
  );

  for (const r of rows) {
    const ext = r.extendsIds.length === 0 ? "—" : r.extendsIds.map((e) => `\`${e}\``).join(" + ");
    const owner = r.plugin === null ? "the core host" : `\`plugins/${r.plugin.dir}/\``;
    push(
      `| \`${r.id}\` | ${r.version} | ${r.primitives} | ${r.relations} | ${r.rules} | ${cell(ext)} | ${owner} |`,
    );
  }

  push(
    "",
    `Across the ${base.length} base profiles that is ${totalPrimitives} primitive types,`,
    `${totalRelations} relation types and ${totalRules} declared validation rules. Derived`,
    "profiles are excluded from those totals: their types are their parents',",
    "and counting them again would count every inherited type twice.",
    "",
    "## The profiles",
    "",
  );

  for (const r of rows) {
    push(`### \`${r.id}\``, "");
    push(`**${r.label}** · v${r.version}`, "");
    if (r.shownDescription !== "") {
      push(brief(r.shownDescription, 700), "");
      if (r.ownDescription === "") {
        push(
          "*(The profile declares no description of its own; this is its plugin's.",
          "See [Known gaps](#known-gaps).)*",
          "",
        );
      }
    }

    const facts = [
      plural(r.primitives, "primitive type"),
      plural(r.relations, "relation type"),
      plural(r.categories, "category", "categories"),
      plural(r.scopes, "scope"),
      `${plural(r.rules, "declared validation rule")}`,
    ];
    if (r.templates > 0) facts.push(plural(r.templates, "template"));
    push(`- **Resolved:** ${facts.join(", ")}`);

    if (r.extendsIds.length > 0) {
      push(
        `- **Extends:** ${r.extendsIds.map((e) => `\`${e}\``).join(", ")} — ` +
          (r.ownPrimitives === 0 && r.ownRelations === 0
            ? "a pure composition, declaring no types of its own"
            : `adds ${plural(r.ownPrimitives, "primitive type")} and ` +
              `${plural(r.ownRelations, "relation type")} of its own`),
      );
    }

    if (r.plugin === null) {
      push("- **Shipped by:** the core host, not a plugin");
    } else {
      push(
        `- **Shipped by:** \`plugins/${r.plugin.dir}/\` — \`${r.plugin.id}\` v${r.plugin.version}`,
      );
      push(...capabilityLines(r.plugin));
    }
    push("");
  }

  push("## Derived profiles", "");
  if (derived.length === 0) {
    push("None: every profile is a base profile.", "");
  } else {
    push(
      "These compose an existing vocabulary rather than restating it — the parent",
      "stays usable on its own, and the child adds one concern across it.",
      "",
      "| Profile | Extends | Adds of its own |",
      "| --- | --- | --- |",
      ...derived.map(
        (r) =>
          `| \`${r.id}\` | ${r.extendsIds.map((e) => `\`${e}\``).join(" + ")} | ` +
          `${r.ownPrimitives} primitive, ${r.ownRelations} relation type(s) |`,
      ),
      "",
    );
  }

  push("## Known gaps", "", "### Profiles that declare no description of their own", "");
  if (noOwnDescription.length === 0) {
    push("None: every profile declares its own `description`.", "");
  } else {
    push(
      `${noOwnDescription.length} of ${rows.length} profiles declare no \`description\` of their own.`,
      "`DomainProfile.description` is optional, so this passes schema validation.",
      "What the section above shows for them is their plugin manifest's",
      "description, which describes the plugin rather than the vocabulary — a",
      "reader asking \"what does this profile model?\" is answered with \"what does",
      "this plugin do?\", and the two are not the same question. Listed so the gap",
      "is visible rather than papered over:",
      "",
      ...noOwnDescription.map(
        (r) =>
          `- \`${r.id}\`${
            r.shownDescription !== ""
              ? " — falls back to the plugin manifest"
              : " — **no description from either source**"
          }`,
      ),
      "",
    );
  }
  if (noDescriptionAtAll.length > 0) {
    push(
      `Of those, ${noDescriptionAtAll.length} have no description from either source and`,
      "appear above with no prose at all.",
      "",
    );
  }

  push("### Profile id version tails", "");
  push(
    "[SPEC-PLUGIN-NAMING §5.5.1](../specs/SPEC-PLUGIN-NAMING.md) fixes a profile",
    "id as `profile:<leaf>:<major>.<minor>` and defines the tail as a",
    "**compatibility series, not a release**. It moves only when the type",
    "catalogue changes in a way existing workbooks cannot survive, because the",
    "id is recorded in the `workbook.create` operation of every workbook that",
    "uses it and that log is append-only. Changing an id does not rename",
    "anything; it orphans every log that names it, and the host has no",
    "profile-id migration.",
    "",
    "**So the tail does not tell you the profile's version, and is not meant",
    "to.** Read `version` from the profile, or the Version column above.",
    "",
  );
  if (tailBehindVersion.length > 0) {
    push(
      `${plural(tailBehindVersion.length, "profile")} carr${tailBehindVersion.length === 1 ? "ies" : "y"} a tail behind the current \`version\`.`,
      "That is the rule working, not drift: the catalogue grew compatibly and",
      "the series stayed put.",
      "",
      ...tailBehindVersion.map((r) => `- \`${r.id}\` at v${r.version}`),
      "",
    );
  }
  if (idDefects.length === 0) {
    push("Every id's tail is a well-formed `<major>.<minor>` pair.", "");
  } else {
    push(
      `${plural(idDefects.length, "id")} ${idDefects.length === 1 ? "does" : "do"} not satisfy the two-segment rule:`,
      "",
      ...idDefects.map((d) => `- \`${d.id}\` — ${d.note}`),
      "",
      `${idDefects.length === 1 ? "It predates" : "These predate"} §5.5.1 and ${idDefects.length === 1 ? "has" : "have"} workbooks in the field, so`,
      `${idDefects.length === 1 ? "it is" : "they are"} exempt by name in \`tests/_meta/profile-contract.test.ts\` rather than`,
      "renamed — the same posture §9 takes for the other naming gates. A new",
      "profile cannot join that list without a deliberate edit.",
      "",
    );
  }

  push(
    "## What this document does not cover",
    "",
    "Two kinds of profile exist that are deliberately absent here, because",
    "neither belongs to this repository and including either would make the",
    "document a function of the machine it was generated on:",
    "",
    "- **Runtime-registered profiles.** A data directory can hold profiles",
    "  registered through `fdpm.profile.register` or `fdpm profile register`,",
    "  stored under `<data-dir>/profiles/`. This atlas is built against an empty",
    "  data directory on purpose.",
    "- **User-installed plugins.** The loader also discovers plugins from",
    "  `~/.fdpm/plugins`. Only plugins under this checkout's `plugins/` are",
    "  counted.",
    "",
    "Run `fdpm profile list` to see what a given workspace actually has, which",
    "may legitimately be more than this.",
    "",
    "## Regenerating",
    "",
    "```sh",
    "npx tsx scripts/build-profile-atlas.ts           # write",
    "npx tsx scripts/build-profile-atlas.ts --check   # verify, exit 1 on drift",
    "```",
    "",
    "See also [CENSUS.md](./CENSUS.md), the counted facts about this repository,",
    "and [SPEC-PLUGIN-NAMING.md](../specs/SPEC-PLUGIN-NAMING.md), which fixes the",
    "naming rules these ids follow. Back to the [repository root](../../README.md).",
    "",
  );

  return `${L.join("\n").replace(/\n{3,}/g, "\n\n")}`;
}

const text = await build();

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT_PATH, "utf8");
  } catch {
    console.error(`profile atlas: ${OUT_PATH} does not exist; run without --check`);
    process.exit(1);
  }
  if (current !== text) {
    console.error(
      "profile atlas: docs/architecture/PROFILES.md is stale.\n" +
        "Regenerate with: npx tsx scripts/build-profile-atlas.ts",
    );
    process.exit(1);
  }
  console.log("profile atlas: up to date");
} else {
  writeFileSync(OUT_PATH, text, "utf8");
  console.log(`wrote ${OUT_PATH}`);
}
