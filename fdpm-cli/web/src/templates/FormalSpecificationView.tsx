/**
 * Formal-Specification template.
 *
 * Renders a `profile:formal-specification:*` workbook as a paged
 * specification document, structured around `fs:Section` containers
 * and the `fs:ContainedIn` relations that bind primitives to sections.
 *
 * Per-type rendering is opinionated:
 *   - fs:Equation       — LaTeX source in monospace + variables table
 *   - fs:Phase          — input/output/procedure/exit grid + Precedes chain
 *   - fs:Definition     — formal/informal pair
 *   - fs:FormalProperty — claim / intuition / caveat blocks
 *   - fs:Assumption     — kind+status badges + statement
 *   - fs:Limitation     — kind badge + description
 *   - fs:FailureMode    — severity + condition + recovery
 *   - fs:Citation       — bibliography line with DOI/URL link
 *   - fs:Actor          — kind badge + responsibilities
 *
 * Cross-references (Cites, OccursIn) are surfaced inline on the source
 * card with click-through links to the target's anchor in the page.
 *
 * Falls back to a minimal generic card for any fs:* type not enumerated
 * above — the renderer never silently drops content.
 */
import type { Primitive, Relation, WorkbookDetailResponse } from "../types";
import { MathBlock } from "./Math";
import { ProseWithMath } from "./ProseWithMath";

interface Props {
  data: WorkbookDetailResponse;
}

// ---------------------------------------------------------------------
// Relation helpers
// ---------------------------------------------------------------------

function asRelationArray(
  rels: WorkbookDetailResponse["relations"],
): Relation[] {
  if (!rels) return [];
  if (Array.isArray(rels)) return rels;
  return Object.values(rels);
}

function relSrc(r: Relation): string | undefined {
  return r.src_id ?? r.source_id;
}
function relTgt(r: Relation): string | undefined {
  return r.dst_id ?? r.target_id;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString);
  return [];
}

// ---------------------------------------------------------------------
// Page assembly: which primitives belong to which section, in what order
// ---------------------------------------------------------------------

interface SectionEntry {
  section: Primitive;
  /** Primitive ids in render order, deduped. */
  childIds: string[];
}

function buildSectionLayout(data: WorkbookDetailResponse): SectionEntry[] {
  const sections = Object.values(data.primitives)
    .filter((p) => p.type_id === "fs:Section")
    .sort(
      (a, b) =>
        asNumber(a.field_values?.number) - asNumber(b.field_values?.number),
    );

  const containedIn = asRelationArray(data.relations).filter(
    (r) => r.type_id === "fs:ContainedIn",
  );

  return sections.map((section) => {
    const edges = containedIn.filter((r) => relTgt(r) === section.id);
    edges.sort((a, b) => {
      const oa = asNumber(a.field_values?.["order"]);
      const ob = asNumber(b.field_values?.["order"]);
      if (oa !== ob) return oa - ob;
      return asString(relSrc(a)).localeCompare(asString(relSrc(b)));
    });
    const seen = new Set<string>();
    const childIds: string[] = [];
    for (const e of edges) {
      const src = relSrc(e);
      if (!src || seen.has(src)) continue;
      // is_primary=false edges are secondary placements; render them on the
      // primary section only to avoid duplication.
      const isPrimary = e.field_values?.["is_primary"];
      if (isPrimary === false) continue;
      seen.add(src);
      if (data.primitives[src]) childIds.push(src);
    }
    return { section, childIds };
  });
}

// ---------------------------------------------------------------------
// Cross-reference helpers
// ---------------------------------------------------------------------

function citationsFor(primId: string, rels: Relation[]): Relation[] {
  return rels.filter(
    (r) => r.type_id === "fs:Cites" && relSrc(r) === primId,
  );
}

function precedesNext(phaseId: string, rels: Relation[]): string | null {
  const r = rels.find(
    (r) => r.type_id === "fs:Precedes" && relSrc(r) === phaseId,
  );
  return r ? relTgt(r) ?? null : null;
}

function precedesPrev(phaseId: string, rels: Relation[]): string | null {
  const r = rels.find(
    (r) => r.type_id === "fs:Precedes" && relTgt(r) === phaseId,
  );
  return r ? relSrc(r) ?? null : null;
}

function occursInPhase(failureId: string, rels: Relation[]): string | null {
  const r = rels.find(
    (r) => r.type_id === "fs:OccursIn" && relSrc(r) === failureId,
  );
  return r ? relTgt(r) ?? null : null;
}

function anchorFor(primId: string): string {
  return `prim-${primId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function PrimLink({
  primId,
  data,
}: {
  primId: string;
  data: WorkbookDetailResponse;
}) {
  const target = data.primitives[primId];
  const label = target ? pickTitle(target) ?? primId : primId;
  return (
    <a className="fs-xref" href={`#${anchorFor(primId)}`}>
      {label}
    </a>
  );
}

const TITLE_KEYS = ["name", "title", "term", "key"];
function pickTitle(p: Primitive): string | null {
  for (const k of TITLE_KEYS) {
    const v = p.field_values?.[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

// ---------------------------------------------------------------------
// Per-type renderers
// ---------------------------------------------------------------------

function CitesLine({
  primId,
  data,
  rels,
}: {
  primId: string;
  data: WorkbookDetailResponse;
  rels: Relation[];
}) {
  const cites = citationsFor(primId, rels);
  if (cites.length === 0) return null;
  return (
    <div className="fs-cites-line">
      <span className="fs-meta-label">Cites:</span>{" "}
      {cites.map((c, i) => {
        const tgt = relTgt(c);
        if (!tgt) return null;
        return (
          <span key={c.id ?? `${primId}-${i}`}>
            {i > 0 && ", "}
            <PrimLink primId={tgt} data={data} />
          </span>
        );
      })}
    </div>
  );
}

function EquationCard({
  primitive,
  data,
  rels,
}: {
  primitive: Primitive;
  data: WorkbookDetailResponse;
  rels: Relation[];
}) {
  const f = primitive.field_values ?? {};
  const variables = Array.isArray(f["variables"])
    ? (f["variables"] as Array<Record<string, unknown>>)
    : [];
  const expression = asString(f["expression"]);
  const notation = asString(f["notation"]);
  const isLatex = notation === "latex";
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-equation">
      <header className="fs-card-header">
        <h4>
          {asString(f["number"]) ? <span className="fs-eq-num">({asString(f["number"])})</span> : null}{" "}
          {asString(f["name"]) || primitive.id}
        </h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      {isLatex ? (
        <>
          <MathBlock expression={expression} className="fs-equation-rendered" />
          <details className="fs-equation-source-toggle">
            <summary>LaTeX source</summary>
            <pre className="fs-equation-source">
              <code>{expression}</code>
            </pre>
          </details>
        </>
      ) : (
        <pre className="fs-equation-source">
          <code>{expression}</code>
        </pre>
      )}
      <div className="fs-meta-line">
        <span className="fs-meta-label">notation:</span>{" "}
        <code>{notation}</code>
      </div>
      {variables.length > 0 && (
        <div className="fs-variables">
          <div className="fs-meta-label">Variables</div>
          <table className="fs-vars-table">
            <thead>
              <tr>
                <th>name</th>
                <th>shape</th>
                <th>description</th>
              </tr>
            </thead>
            <tbody>
              {variables.map((v, i) => (
                <tr key={i}>
                  <td><code>{asString(v["name"])}</code></td>
                  <td><code>{asString(v["shape"])}</code></td>
                  <td>{asString(v["description"])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {asString(f["domain_constraints"]) && (
        <div className="fs-prose-block">
          <div className="fs-meta-label">Domain constraints</div>
          <ProseWithMath as="p" text={asString(f["domain_constraints"])} />
        </div>
      )}
      {asString(f["derivation"]) && (
        <div className="fs-prose-block">
          <div className="fs-meta-label">Derivation</div>
          <ProseWithMath as="p" text={asString(f["derivation"])} />
        </div>
      )}
      <CitesLine primId={primitive.id} data={data} rels={rels} />
    </article>
  );
}

function PhaseCard({
  primitive,
  data,
  rels,
}: {
  primitive: Primitive;
  data: WorkbookDetailResponse;
  rels: Relation[];
}) {
  const f = primitive.field_values ?? {};
  const procedure = asStringList(f["procedure"]);
  const next = precedesNext(primitive.id, rels);
  const prev = precedesPrev(primitive.id, rels);
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-phase">
      <header className="fs-card-header">
        <h4>
          <span className="fs-phase-num">Phase {asString(f["number"])}</span>{" "}
          {asString(f["name"])}
        </h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      {asString(f["question"]) && (
        <blockquote className="fs-phase-question">
          <ProseWithMath text={asString(f["question"])} />
        </blockquote>
      )}
      <dl className="fs-phase-grid">
        <dt>Inputs</dt>
        <dd><ProseWithMath text={asString(f["inputs"])} /></dd>
        <dt>Outputs</dt>
        <dd><ProseWithMath text={asString(f["outputs"])} /></dd>
        {procedure.length > 0 && (
          <>
            <dt>Procedure</dt>
            <dd>
              <ol className="fs-procedure">
                {procedure.map((step, i) => (
                  <li key={i}>
                    <ProseWithMath text={step} />
                  </li>
                ))}
              </ol>
            </dd>
          </>
        )}
        <dt>Exit condition</dt>
        <dd><ProseWithMath text={asString(f["exit_condition"])} /></dd>
        {asString(f["branch_condition"]) && (
          <>
            <dt>Branch condition</dt>
            <dd><ProseWithMath text={asString(f["branch_condition"])} /></dd>
          </>
        )}
        {asString(f["domain"]) && (
          <>
            <dt>Domain</dt>
            <dd>{asString(f["domain"])}</dd>
          </>
        )}
      </dl>
      {(prev || next) && (
        <div className="fs-meta-line fs-phase-chain">
          {prev && (
            <>
              <span className="fs-meta-label">prev:</span>{" "}
              <PrimLink primId={prev} data={data} />
            </>
          )}
          {prev && next && <span className="sep">·</span>}
          {next && (
            <>
              <span className="fs-meta-label">next:</span>{" "}
              <PrimLink primId={next} data={data} />
            </>
          )}
        </div>
      )}
      <CitesLine primId={primitive.id} data={data} rels={rels} />
    </article>
  );
}

function DefinitionCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-definition">
      <header className="fs-card-header">
        <h4>{asString(f["term"])}</h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      <div className="fs-prose-block">
        <div className="fs-meta-label">Formal</div>
        <ProseWithMath as="p" text={asString(f["formal"])} />
      </div>
      {asString(f["informal"]) && (
        <div className="fs-prose-block">
          <div className="fs-meta-label">Informal</div>
          <ProseWithMath as="p" className="fs-informal" text={asString(f["informal"])} />
        </div>
      )}
    </article>
  );
}

function FormalPropertyCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-property">
      <header className="fs-card-header">
        <h4>{asString(f["name"])}</h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      <div className="fs-prose-block">
        <div className="fs-meta-label">Claim</div>
        <ProseWithMath as="p" text={asString(f["claim"])} />
      </div>
      <div className="fs-prose-block">
        <div className="fs-meta-label">Intuition</div>
        <ProseWithMath as="p" text={asString(f["intuition"])} />
      </div>
      {asString(f["caveat"]) && (
        <div className="fs-prose-block fs-caveat">
          <div className="fs-meta-label">Caveat</div>
          <ProseWithMath as="p" text={asString(f["caveat"])} />
        </div>
      )}
    </article>
  );
}

function AssumptionCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const status = asString(f["status"]);
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-assumption">
      <header className="fs-card-header">
        <h4>{asString(f["name"])}</h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      <div className="fs-badges">
        <span className={`fs-badge fs-badge-kind-${asString(f["kind"]) || "none"}`}>
          {asString(f["kind"]) || "—"}
        </span>
        {status && (
          <span className={`fs-badge fs-badge-status-${status}`}>{status}</span>
        )}
        <span className="fs-badge fs-badge-falsifiable">
          falsifiable: {f["falsifiable"] === true ? "yes" : "no"}
        </span>
      </div>
      <ProseWithMath as="p" className="fs-statement" text={asString(f["statement"])} />
      {asString(f["risk_owner"]) && (
        <div className="fs-meta-line">
          <span className="fs-meta-label">risk owner:</span> {asString(f["risk_owner"])}
        </div>
      )}
    </article>
  );
}

function LimitationCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-limitation">
      <header className="fs-card-header">
        <h4>
          <span className={`fs-badge fs-badge-kind-${asString(f["kind"]) || "none"}`}>
            {asString(f["kind"]) || "limitation"}
          </span>
        </h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      <ProseWithMath as="p" text={asString(f["description"])} />
    </article>
  );
}

function FailureModeCard({
  primitive,
  data,
  rels,
}: {
  primitive: Primitive;
  data: WorkbookDetailResponse;
  rels: Relation[];
}) {
  const f = primitive.field_values ?? {};
  const phaseId = occursInPhase(primitive.id, rels);
  const severity = asString(f["severity"]);
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-failure">
      <header className="fs-card-header">
        <h4>{asString(f["slug"]) || primitive.id}</h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      <div className="fs-badges">
        <span className={`fs-badge fs-badge-severity-${severity}`}>{severity}</span>
        {phaseId && (
          <span className="fs-meta-line">
            <span className="fs-meta-label">occurs in:</span>{" "}
            <PrimLink primId={phaseId} data={data} />
          </span>
        )}
      </div>
      <div className="fs-prose-block">
        <div className="fs-meta-label">Condition</div>
        <ProseWithMath as="p" text={asString(f["condition"])} />
      </div>
      <div className="fs-prose-block">
        <div className="fs-meta-label">Recovery</div>
        <ProseWithMath as="p" text={asString(f["recovery"])} />
      </div>
    </article>
  );
}

function CitationCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const authors = asStringList(f["authors"]).join(", ");
  const url = asString(f["url"]);
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-citation">
      <header className="fs-card-header">
        <h4>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              {asString(f["title"])}
            </a>
          ) : (
            asString(f["title"])
          )}
        </h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      <div className="fs-citation-line">
        {authors && <span>{authors}</span>}
        {asString(f["year"]) && <span> ({asString(f["year"])})</span>}
        {asString(f["venue"]) && <span>. <em>{asString(f["venue"])}</em></span>}
        {asString(f["category"]) && (
          <span className={`fs-badge fs-badge-cat-${asString(f["category"])}`}>
            {asString(f["category"])}
          </span>
        )}
      </div>
    </article>
  );
}

function ActorCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-actor">
      <header className="fs-card-header">
        <h4>{asString(f["name"])}</h4>
        <code className="fs-card-id">{primitive.id}</code>
      </header>
      <div className="fs-badges">
        <span className={`fs-badge fs-badge-actor-${asString(f["kind"])}`}>
          {asString(f["kind"])}
        </span>
      </div>
      <ProseWithMath as="p" text={asString(f["responsibilities"])} />
    </article>
  );
}

function GenericFsCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const title = pickTitle(primitive);
  const otherKeys = Object.keys(f).filter(
    (k) => !TITLE_KEYS.includes(k),
  );
  return (
    <article id={anchorFor(primitive.id)} className="fs-card fs-generic">
      <header className="fs-card-header">
        {title && <h4>{title}</h4>}
        <code className="fs-card-id">
          {primitive.id} <span className="fs-card-type">({primitive.type_id})</span>
        </code>
      </header>
      {otherKeys.length > 0 && (
        <dl className="fs-generic-fields">
          {otherKeys.map((k) => (
            <div key={k} className="field">
              <dt>{k}</dt>
              <dd>
                {(() => {
                  const v = f[k];
                  if (v == null) return "—";
                  if (typeof v === "string") return v;
                  if (typeof v === "number" || typeof v === "boolean") return String(v);
                  return <code>{JSON.stringify(v)}</code>;
                })()}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

function renderPrimitive(
  primitive: Primitive,
  data: WorkbookDetailResponse,
  rels: Relation[],
) {
  switch (primitive.type_id) {
    case "fs:Equation":
      return <EquationCard key={primitive.id} primitive={primitive} data={data} rels={rels} />;
    case "fs:Phase":
      return <PhaseCard key={primitive.id} primitive={primitive} data={data} rels={rels} />;
    case "fs:Definition":
      return <DefinitionCard key={primitive.id} primitive={primitive} />;
    case "fs:FormalProperty":
      return <FormalPropertyCard key={primitive.id} primitive={primitive} />;
    case "fs:Assumption":
      return <AssumptionCard key={primitive.id} primitive={primitive} />;
    case "fs:Limitation":
      return <LimitationCard key={primitive.id} primitive={primitive} />;
    case "fs:FailureMode":
      return <FailureModeCard key={primitive.id} primitive={primitive} data={data} rels={rels} />;
    case "fs:Citation":
      return <CitationCard key={primitive.id} primitive={primitive} />;
    case "fs:Actor":
      return <ActorCard key={primitive.id} primitive={primitive} />;
    default:
      return <GenericFsCard key={primitive.id} primitive={primitive} />;
  }
}

// ---------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------

export function FormalSpecificationView({ data }: Props) {
  const layout = buildSectionLayout(data);
  const rels = asRelationArray(data.relations);

  // Primitives that have no ContainedIn → any section. Surfaced as an
  // "Unfiled" section at the bottom so nothing in the workbook is hidden.
  const placedIds = new Set<string>();
  for (const entry of layout) {
    for (const id of entry.childIds) placedIds.add(id);
  }
  for (const entry of layout) {
    placedIds.add(entry.section.id);
  }
  const unfiled = Object.values(data.primitives)
    .filter((p) => !placedIds.has(p.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="fs-doc">
      <nav className="fs-toc" aria-label="Table of contents">
        <div className="fs-toc-title">Contents</div>
        <ol className="fs-toc-list">
          {layout.map(({ section }) => (
            <li key={section.id}>
              <a href={`#${anchorFor(section.id)}`}>
                <span className="fs-toc-num">
                  {asString(section.field_values?.number)}
                </span>{" "}
                {asString(section.field_values?.title)}
              </a>
            </li>
          ))}
          {unfiled.length > 0 && (
            <li>
              <a href="#fs-unfiled">
                <span className="fs-toc-num">∗</span> Unfiled
              </a>
            </li>
          )}
        </ol>
      </nav>

      <div className="fs-body">
        {layout.map(({ section, childIds }) => {
          const f = section.field_values ?? {};
          return (
            <section
              key={section.id}
              id={anchorFor(section.id)}
              className="fs-section"
            >
              <header className="fs-section-header">
                <h3>
                  <span className="fs-section-num">{asString(f["number"])}</span>{" "}
                  {asString(f["title"])}
                </h3>
                <div className="fs-section-meta">
                  <span className={`fs-badge fs-badge-status-${asString(f["status"])}`}>
                    {asString(f["status"])}
                  </span>
                  {asString(f["version"]) && (
                    <span className="fs-meta-line">
                      <span className="fs-meta-label">version:</span>{" "}
                      <code>{asString(f["version"])}</code>
                    </span>
                  )}
                </div>
                {asString(f["description"]) && (
                  <ProseWithMath as="p" className="fs-section-description" text={asString(f["description"])} />
                )}
              </header>
              {childIds.length === 0 ? (
                <p className="fs-section-empty">
                  No primitives are contained in this section yet.
                </p>
              ) : (
                <div className="fs-section-body">
                  {childIds.map((id) =>
                    renderPrimitive(data.primitives[id]!, data, rels),
                  )}
                </div>
              )}
            </section>
          );
        })}

        {unfiled.length > 0 && (
          <section id="fs-unfiled" className="fs-section fs-section-unfiled">
            <header className="fs-section-header">
              <h3>
                <span className="fs-section-num">∗</span> Unfiled
              </h3>
              <p className="fs-section-description">
                Primitives without a primary <code>fs:ContainedIn</code> edge to a
                section. These usually indicate authoring gaps — every primitive
                in a formal-specification workbook should belong to a section.
              </p>
            </header>
            <div className="fs-section-body">
              {unfiled.map((p) => renderPrimitive(p, data, rels))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
