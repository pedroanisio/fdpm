/**
 * Software-Architecture template.
 *
 * Renders a `profile:software-architecture:*` workbook as a navigable
 * architecture document. Layout follows ISO/IEC/IEEE 42010 vocabulary
 * the profile types directly (Concept, Capability, Entity, Decision,
 * Invariant, Constraint, Guarantee, Risk, Evidence, plus State /
 * Transition / Endpoint / Schema / Contract / Stakeholder / Viewpoint /
 * View / Node / Actor / FailureMode / Event).
 *
 * The page structure:
 *   - Sticky left rail: scope-grouped table of contents.
 *   - Body: ten sections (Stakeholders → Concepts → Capabilities →
 *     Entities by scope → Decisions → Invariants/Constraints/Guarantees
 *     → Risks → State machines → Interfaces → Topology → Evidence →
 *     Other). Sections with zero primitives are omitted.
 *   - Each card surfaces the primitive's most-load-bearing fields plus
 *     incoming/outgoing edges of analytically valuable types
 *     (Constrains, Justifies, Delivers, RefersTo, Risks, Threatens,
 *     Mitigates, Implements, Exposes, DeployedTo).
 *
 * Falls back to a generic card for any sw:* type not enumerated.
 */
import type { Primitive, Relation, WorkbookDetailResponse } from "../types";

interface Props {
  data: WorkbookDetailResponse;
}

// ---------------------------------------------------------------------
// Helpers
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

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function anchorFor(primId: string): string {
  return `sw-${primId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/** Cross-reference link to another primitive in the workbook. */
function PrimLink({
  primId,
  data,
  fallbackKey,
}: {
  primId: string;
  data: WorkbookDetailResponse;
  fallbackKey?: string;
}) {
  const target = data.primitives[primId];
  const label = target
    ? asString(target.field_values?.["name"]) ||
      asString(target.field_values?.["title"]) ||
      asString(target.field_values?.[fallbackKey ?? "name"]) ||
      primId
    : primId;
  return (
    <a className="sw-xref" href={`#${anchorFor(primId)}`}>
      {label}
    </a>
  );
}

/** Render a list of cross-refs as a `label: a, b, c` line. */
function XrefLine({
  label,
  rels,
  data,
  side,
}: {
  label: string;
  rels: Relation[];
  data: WorkbookDetailResponse;
  /** Which end of the relation to render — `src` or `tgt`. */
  side: "src" | "tgt";
}) {
  if (rels.length === 0) return null;
  return (
    <div className="sw-meta-line">
      <span className="sw-meta-label">{label}:</span>{" "}
      {rels.map((r, i) => {
        const id = side === "src" ? relSrc(r) : relTgt(r);
        if (!id) return null;
        return (
          <span key={r.id ?? `${i}-${id}`}>
            {i > 0 && ", "}
            <PrimLink primId={id} data={data} />
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// Type-specific cards
// ---------------------------------------------------------------------

function ConceptCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-concept">
      <header className="sw-card-header">
        <h4>{asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      {asString(f["definition"]) && (
        <p className="sw-card-prose">{asString(f["definition"])}</p>
      )}
    </article>
  );
}

function CapabilityCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const maturity = asString(f["maturity"]);
  const deliveredBy = rels.filter(
    (r) => r.type_id === "sw:Delivers" && relTgt(r) === primitive.id,
  );
  const realizedBy = rels.filter(
    (r) => r.type_id === "sw:RealizedBy" && relSrc(r) === primitive.id,
  );

  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-capability">
      <header className="sw-card-header">
        <h4>{asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      {asString(f["summary"]) && (
        <p className="sw-card-prose">{asString(f["summary"])}</p>
      )}
      <div className="sw-badges">
        {maturity && (
          <span className={`sw-badge sw-maturity-${maturity}`}>{maturity}</span>
        )}
      </div>
      <footer className="sw-card-footer">
        <XrefLine label="delivered by" rels={deliveredBy} data={data} side="src" />
        <XrefLine label="realized by" rels={realizedBy} data={data} side="tgt" />
      </footer>
    </article>
  );
}

function EntityCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const kind = asString(f["kind"]);
  const lifecycle = asString(f["lifecycle"]);

  const dependsOn = rels.filter(
    (r) => r.type_id === "sw:DependsOn" && relSrc(r) === primitive.id,
  );
  const dependents = rels.filter(
    (r) => r.type_id === "sw:DependsOn" && relTgt(r) === primitive.id,
  );
  const constrainedBy = rels.filter(
    (r) => r.type_id === "sw:Constrains" && relTgt(r) === primitive.id,
  );
  const delivers = rels.filter(
    (r) => r.type_id === "sw:Delivers" && relSrc(r) === primitive.id,
  );
  const refersTo = rels.filter(
    (r) => r.type_id === "sw:RefersTo" && relSrc(r) === primitive.id,
  );
  const carriesRisks = rels.filter(
    (r) => r.type_id === "sw:Risks" && relSrc(r) === primitive.id,
  );
  const deployedTo = rels.filter(
    (r) => r.type_id === "sw:DeployedTo" && relSrc(r) === primitive.id,
  );

  return (
    <article id={anchorFor(primitive.id)} className={`sw-card sw-entity sw-entity-${kind}`}>
      <header className="sw-card-header">
        <h4>{asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      {asString(f["description"]) && (
        <p className="sw-card-prose">{asString(f["description"])}</p>
      )}
      <div className="sw-badges">
        {kind && <span className="sw-badge sw-badge-kind">{kind}</span>}
        {lifecycle && (
          <span className={`sw-badge sw-lifecycle-${lifecycle}`}>{lifecycle}</span>
        )}
      </div>
      <footer className="sw-card-footer">
        <XrefLine label="delivers" rels={delivers} data={data} side="tgt" />
        <XrefLine label="depends on" rels={dependsOn} data={data} side="tgt" />
        <XrefLine label="depended on by" rels={dependents} data={data} side="src" />
        <XrefLine label="constrained by" rels={constrainedBy} data={data} side="src" />
        <XrefLine label="deployed to" rels={deployedTo} data={data} side="tgt" />
        <XrefLine label="refers to" rels={refersTo} data={data} side="tgt" />
        <XrefLine label="risks" rels={carriesRisks} data={data} side="tgt" />
      </footer>
    </article>
  );
}

function DecisionCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const status = asString(f["status"]);
  const justifiedBy = rels.filter(
    (r) => r.type_id === "sw:Justifies" && relTgt(r) === primitive.id,
  );
  const supersedes = rels.filter(
    (r) => r.type_id === "sw:Supersedes" && relSrc(r) === primitive.id,
  );

  // alternatives may be a single struct or absent
  const alt = f["alternatives"] as
    | { name?: unknown; reason_rejected?: unknown }
    | undefined;

  return (
    <article id={anchorFor(primitive.id)} className={`sw-card sw-decision sw-decision-${status}`}>
      <header className="sw-card-header">
        <h4>{asString(f["title"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      <div className="sw-badges">
        {status && <span className={`sw-badge sw-decision-status-${status}`}>{status}</span>}
        {asString(f["date"]) && (
          <span className="sw-badge sw-badge-date">{asString(f["date"]).slice(0, 10)}</span>
        )}
      </div>
      {asString(f["context"]) && (
        <section className="sw-decision-block">
          <h5>Context</h5>
          <p>{asString(f["context"])}</p>
        </section>
      )}
      {asString(f["rationale"]) && (
        <section className="sw-decision-block">
          <h5>Rationale</h5>
          <p>{asString(f["rationale"])}</p>
        </section>
      )}
      {alt && (asString(alt.name) || asString(alt.reason_rejected)) && (
        <section className="sw-decision-block">
          <h5>Alternative considered</h5>
          <p>
            <strong>{asString(alt.name) || "(unnamed)"}.</strong>{" "}
            {asString(alt.reason_rejected) && <em>{asString(alt.reason_rejected)}</em>}
          </p>
        </section>
      )}
      {asString(f["consequences"]) && (
        <section className="sw-decision-block">
          <h5>Consequences</h5>
          <p>{asString(f["consequences"])}</p>
        </section>
      )}
      {asArray(f["deciders"]).length > 0 && (
        <div className="sw-meta-line">
          <span className="sw-meta-label">deciders:</span>{" "}
          {asArray(f["deciders"]).map(asString).filter(Boolean).join(", ")}
        </div>
      )}
      <footer className="sw-card-footer">
        <XrefLine label="justified by" rels={justifiedBy} data={data} side="src" />
        <XrefLine label="supersedes" rels={supersedes} data={data} side="tgt" />
      </footer>
    </article>
  );
}

function InvariantCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const enforcement = asString(f["enforcement"]);
  const constrains = rels.filter(
    (r) => r.type_id === "sw:Constrains" && relSrc(r) === primitive.id,
  );
  const justifiedBy = rels.filter(
    (r) => r.type_id === "sw:Justifies" && relTgt(r) === primitive.id,
  );
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-invariant">
      <header className="sw-card-header">
        <h4>⚖ {primitive.id}</h4>
      </header>
      {asString(f["statement"]) && (
        <p className="sw-card-prose">{asString(f["statement"])}</p>
      )}
      <div className="sw-badges">
        {enforcement && (
          <span className={`sw-badge sw-enforcement-${enforcement}`}>
            {enforcement}
          </span>
        )}
      </div>
      <footer className="sw-card-footer">
        <XrefLine label="constrains" rels={constrains} data={data} side="tgt" />
        <XrefLine label="justified by" rels={justifiedBy} data={data} side="src" />
      </footer>
    </article>
  );
}

function ConstraintCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const slo = f["slo"] as
    | {
        name?: unknown;
        expression?: unknown;
        comparator?: unknown;
        target?: unknown;
        unit?: unknown;
        window?: unknown;
      }
    | undefined;
  const constrains = rels.filter(
    (r) => r.type_id === "sw:Constrains" && relSrc(r) === primitive.id,
  );

  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-constraint">
      <header className="sw-card-header">
        <h4>📏 {primitive.id}</h4>
      </header>
      {asString(f["statement"]) && (
        <p className="sw-card-prose">{asString(f["statement"])}</p>
      )}
      {slo && asString(slo.name) && (
        <div className="sw-slo">
          <span className="sw-meta-label">SLO:</span>{" "}
          <code>
            {asString(slo.name)} {asString(slo.comparator)}{" "}
            {asString(slo.target)}
            {asString(slo.unit) && asString(slo.unit)}
            {asString(slo.window) && ` over ${asString(slo.window)}`}
          </code>
        </div>
      )}
      <footer className="sw-card-footer">
        <XrefLine label="constrains" rels={constrains} data={data} side="tgt" />
      </footer>
    </article>
  );
}

function GuaranteeCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const justifiedBy = rels.filter(
    (r) => r.type_id === "sw:Justifies" && relTgt(r) === primitive.id,
  );
  const threatenedBy = rels.filter(
    (r) => r.type_id === "sw:Threatens" && relTgt(r) === primitive.id,
  );
  const mitigatedBy = rels.filter(
    (r) => r.type_id === "sw:Mitigates" && relTgt(r) === primitive.id,
  );
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-guarantee">
      <header className="sw-card-header">
        <h4>✓ {primitive.id}</h4>
      </header>
      {asString(f["statement"]) && (
        <p className="sw-card-prose">{asString(f["statement"])}</p>
      )}
      {asString(f["conditions"]) && (
        <p className="sw-card-prose-secondary">
          <em>conditions:</em> {asString(f["conditions"])}
        </p>
      )}
      <footer className="sw-card-footer">
        <XrefLine label="justified by" rels={justifiedBy} data={data} side="src" />
        <XrefLine label="threatened by" rels={threatenedBy} data={data} side="src" />
        <XrefLine label="mitigated by" rels={mitigatedBy} data={data} side="src" />
      </footer>
    </article>
  );
}

function RiskCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const likelihood = asString(f["likelihood"]);
  const impact = asString(f["impact"]);
  const carriedBy = rels.filter(
    (r) => r.type_id === "sw:Risks" && relTgt(r) === primitive.id,
  );
  return (
    <article id={anchorFor(primitive.id)} className={`sw-card sw-risk sw-risk-l${likelihood}-i${impact}`}>
      <header className="sw-card-header">
        <h4>⚠ {asString(f["title"]) || asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      <div className="sw-badges">
        {likelihood && (
          <span className={`sw-badge sw-likelihood-${likelihood}`}>
            likelihood: {likelihood}
          </span>
        )}
        {impact && (
          <span className={`sw-badge sw-impact-${impact}`}>
            impact: {impact}
          </span>
        )}
        {asArray(f["tags"]).length > 0 &&
          asArray(f["tags"]).map((t, i) => (
            <span key={i} className="sw-badge sw-badge-tag">
              {asString(t)}
            </span>
          ))}
      </div>
      {asString(f["mitigation"]) && (
        <p className="sw-card-prose">
          <em>mitigation:</em> {asString(f["mitigation"])}
        </p>
      )}
      <footer className="sw-card-footer">
        <XrefLine label="carried by" rels={carriedBy} data={data} side="src" />
      </footer>
    </article>
  );
}

function EvidenceCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const kind = asString(f["kind"]);
  const justifies = rels.filter(
    (r) => r.type_id === "sw:Justifies" && relSrc(r) === primitive.id,
  );
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-evidence">
      <header className="sw-card-header">
        <h4>📎 {asString(f["source"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      <div className="sw-badges">
        {kind && <span className={`sw-badge sw-evidence-kind-${kind}`}>{kind}</span>}
        {asString(f["timestamp"]) && (
          <span className="sw-badge sw-badge-date">
            {asString(f["timestamp"]).slice(0, 10)}
          </span>
        )}
      </div>
      {asString(f["description"]) && (
        <p className="sw-card-prose">{asString(f["description"])}</p>
      )}
      <footer className="sw-card-footer">
        <XrefLine label="justifies" rels={justifies} data={data} side="tgt" />
      </footer>
    </article>
  );
}

function StakeholderCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-stakeholder">
      <header className="sw-card-header">
        <h4>👥 {asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      <div className="sw-badges">
        {asString(f["role"]) && (
          <span className="sw-badge sw-badge-role">{asString(f["role"])}</span>
        )}
      </div>
      {asArray(f["concerns"]).length > 0 && (
        <ul className="sw-list">
          {asArray(f["concerns"]).map((c, i) => (
            <li key={i}>{asString(c)}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ActorCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const kind = asString(f["kind"]);
  return (
    <article id={anchorFor(primitive.id)} className={`sw-card sw-actor sw-actor-${kind}`}>
      <header className="sw-card-header">
        <h4>👤 {asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      <div className="sw-badges">
        {kind && <span className="sw-badge">{kind}</span>}
      </div>
      {asString(f["description"]) && (
        <p className="sw-card-prose">{asString(f["description"])}</p>
      )}
    </article>
  );
}

function ViewpointCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-viewpoint">
      <header className="sw-card-header">
        <h4>🔭 {asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      {asString(f["description"]) && (
        <p className="sw-card-prose">{asString(f["description"])}</p>
      )}
      {asArray(f["concerns"]).length > 0 && (
        <div className="sw-meta-line">
          <span className="sw-meta-label">concerns:</span>{" "}
          {asArray(f["concerns"]).map(asString).filter(Boolean).join(" · ")}
        </div>
      )}
    </article>
  );
}

function ViewCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-view">
      <header className="sw-card-header">
        <h4>🗺 {asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      {asString(f["summary"]) && (
        <p className="sw-card-prose">{asString(f["summary"])}</p>
      )}
      {asString(f["viewpoint_id"]) && (
        <div className="sw-meta-line">
          <span className="sw-meta-label">viewpoint:</span>{" "}
          <code>{asString(f["viewpoint_id"])}</code>
        </div>
      )}
    </article>
  );
}

function StateCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const terminal = !!f["terminal"];
  return (
    <article id={anchorFor(primitive.id)} className={`sw-card sw-state ${terminal ? "sw-state-terminal" : ""}`}>
      <header className="sw-card-header">
        <h4>
          {terminal ? "■" : "○"} {asString(f["name"]) || primitive.id}
        </h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      {asString(f["entry_conditions"]) && (
        <p className="sw-card-prose-secondary">
          <em>entry:</em> {asString(f["entry_conditions"])}
        </p>
      )}
      {asString(f["entity_id"]) && (
        <div className="sw-meta-line">
          <span className="sw-meta-label">of:</span>{" "}
          <code>{asString(f["entity_id"])}</code>
        </div>
      )}
    </article>
  );
}

function TransitionCard({
  primitive,
  data,
}: {
  primitive: Primitive;
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-transition">
      <header className="sw-card-header">
        <h4>→ {primitive.id}</h4>
      </header>
      <div className="sw-meta-line">
        <span className="sw-meta-label">from:</span>{" "}
        {asString(f["from_state"]) && (
          <PrimLink primId={asString(f["from_state"])} data={data} />
        )}{" "}
        <span className="sw-meta-label">to:</span>{" "}
        {asString(f["to_state"]) && (
          <PrimLink primId={asString(f["to_state"])} data={data} />
        )}
      </div>
      {asString(f["trigger"]) && (
        <p className="sw-card-prose-secondary">
          <em>trigger:</em> {asString(f["trigger"])}
        </p>
      )}
      {asString(f["guard"]) && (
        <p className="sw-card-prose-secondary">
          <em>guard:</em> <code>{asString(f["guard"])}</code>
        </p>
      )}
      {asString(f["action"]) && (
        <p className="sw-card-prose-secondary">
          <em>action:</em> {asString(f["action"])}
        </p>
      )}
    </article>
  );
}

function FailureModeCard({
  primitive,
  rels,
  data,
}: {
  primitive: Primitive;
  rels: Relation[];
  data: WorkbookDetailResponse;
}) {
  const f = primitive.field_values ?? {};
  const severity = asString(f["severity"]);
  const threatens = rels.filter(
    (r) => r.type_id === "sw:Threatens" && relSrc(r) === primitive.id,
  );
  const mitigates = rels.filter(
    (r) => r.type_id === "sw:Mitigates" && relSrc(r) === primitive.id,
  );
  return (
    <article id={anchorFor(primitive.id)} className={`sw-card sw-failure sw-sev-${severity}`}>
      <header className="sw-card-header">
        <h4>💥 {primitive.id}</h4>
      </header>
      <div className="sw-badges">
        {severity && (
          <span className={`sw-badge sw-sev-${severity}`}>{severity}</span>
        )}
      </div>
      {asString(f["description"]) && (
        <p className="sw-card-prose">{asString(f["description"])}</p>
      )}
      {asString(f["detection"]) && (
        <p className="sw-card-prose-secondary">
          <em>detection:</em> {asString(f["detection"])}
        </p>
      )}
      {asString(f["mitigation"]) && (
        <p className="sw-card-prose-secondary">
          <em>mitigation:</em> {asString(f["mitigation"])}
        </p>
      )}
      <footer className="sw-card-footer">
        <XrefLine label="threatens" rels={threatens} data={data} side="tgt" />
        <XrefLine label="mitigates" rels={mitigates} data={data} side="tgt" />
      </footer>
    </article>
  );
}

function EndpointCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const protocol = asString(f["protocol"]);
  const method = asString(f["method"]);
  const path = asString(f["path"]);
  const deprecated = !!f["deprecated"];
  return (
    <article id={anchorFor(primitive.id)} className={`sw-card sw-endpoint ${deprecated ? "sw-deprecated" : ""}`}>
      <header className="sw-card-header">
        <h4>
          🔌 {asString(f["name"]) || primitive.id}{" "}
          {deprecated && <span className="sw-badge sw-deprecated">DEPRECATED</span>}
        </h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      <div className="sw-badges">
        {protocol && <span className="sw-badge sw-protocol">{protocol}</span>}
        {method && <span className="sw-badge sw-method">{method}</span>}
      </div>
      {path && (
        <code className="sw-endpoint-path">{path}</code>
      )}
    </article>
  );
}

function SchemaCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const format = asString(f["format"]);
  const fields = asArray(f["fields"]) as Array<Record<string, unknown>>;
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-schema">
      <header className="sw-card-header">
        <h4>📦 {asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      <div className="sw-badges">
        {format && <span className="sw-badge sw-format">{format}</span>}
        {asString(f["version"]) && (
          <span className="sw-badge">{asString(f["version"])}</span>
        )}
      </div>
      {fields.length > 0 && (
        <table className="sw-schema-fields">
          <tbody>
            {fields.slice(0, 10).map((field, i) => (
              <tr key={i}>
                <td>
                  <code>{asString(field?.["name"])}</code>
                  {field?.["required"] ? "*" : ""}
                </td>
                <td>
                  <code>{asString(field?.["type"])}</code>
                </td>
                <td className="sw-schema-desc">
                  {asString(field?.["description"])}
                </td>
              </tr>
            ))}
            {fields.length > 10 && (
              <tr>
                <td colSpan={3}>
                  <em>… {fields.length - 10} more</em>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </article>
  );
}

function NodeCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const kind = asString(f["kind"]);
  return (
    <article id={anchorFor(primitive.id)} className={`sw-card sw-node sw-node-${kind}`}>
      <header className="sw-card-header">
        <h4>🖥 {asString(f["name"]) || primitive.id}</h4>
        <code className="sw-card-id">{primitive.id}</code>
      </header>
      <div className="sw-badges">
        {kind && <span className="sw-badge sw-node-kind">{kind}</span>}
        {asString(f["multiplicity"]) && (
          <span className="sw-badge">×{asString(f["multiplicity"])}</span>
        )}
        {asString(f["placement"]) && (
          <span className="sw-badge">{asString(f["placement"])}</span>
        )}
      </div>
    </article>
  );
}

function GenericCard({ primitive }: { primitive: Primitive }) {
  const f = primitive.field_values ?? {};
  const otherKeys = Object.keys(f);
  return (
    <article id={anchorFor(primitive.id)} className="sw-card sw-generic">
      <header className="sw-card-header">
        <h4>{asString(f["name"]) || asString(f["title"]) || primitive.id}</h4>
        <code className="sw-card-id">
          {primitive.id}{" "}
          <span className="sw-card-type">({primitive.type_id})</span>
        </code>
      </header>
      {otherKeys.length > 0 && (
        <dl className="sw-generic-fields">
          {otherKeys.map((k) => {
            const v = f[k];
            if (v == null || v === "") return null;
            const display =
              typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                ? String(v)
                : JSON.stringify(v);
            return (
              <div key={k} className="field">
                <dt>{k}</dt>
                <dd>{display}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------

const KNOWN_TYPES = new Set([
  "sw:Concept",
  "sw:Capability",
  "sw:Entity",
  "sw:Decision",
  "sw:Invariant",
  "sw:Constraint",
  "sw:Guarantee",
  "sw:Risk",
  "sw:Evidence",
  "sw:Stakeholder",
  "sw:Actor",
  "sw:Viewpoint",
  "sw:View",
  "sw:State",
  "sw:Transition",
  "sw:FailureMode",
  "sw:Endpoint",
  "sw:Schema",
  "sw:Contract",
  "sw:Event",
  "sw:Node",
]);

const SCOPE_ORDER = [
  "scope:sw:domain",
  "scope:sw:runtime",
  "scope:sw:deployment",
  "scope:sw:organizational",
] as const;

const SCOPE_LABELS: Record<string, string> = {
  "scope:sw:domain": "Domain",
  "scope:sw:runtime": "Runtime",
  "scope:sw:deployment": "Deployment",
  "scope:sw:organizational": "Organizational",
};

interface Section {
  id: string;
  title: string;
  count: number;
}

export function SoftwareArchitectureView({ data }: Props) {
  const rels = asRelationArray(data.relations);
  const allPrims = Object.values(data.primitives);

  const byType = (typeId: string): Primitive[] =>
    allPrims
      .filter((p) => p.type_id === typeId)
      .sort((a, b) =>
        (a.field_values?.["name"]
          ? asString(a.field_values["name"])
          : a.id
        ).localeCompare(
          b.field_values?.["name"]
            ? asString(b.field_values["name"])
            : b.id,
        ),
      );

  const concepts = byType("sw:Concept");
  const capabilities = byType("sw:Capability");
  const entities = allPrims.filter((p) => p.type_id === "sw:Entity");
  const decisions = byType("sw:Decision");
  const invariants = byType("sw:Invariant");
  const constraints = byType("sw:Constraint");
  const guarantees = byType("sw:Guarantee");
  const risks = byType("sw:Risk");
  const evidence = byType("sw:Evidence");
  const stakeholders = byType("sw:Stakeholder");
  const actors = byType("sw:Actor");
  const viewpoints = byType("sw:Viewpoint");
  const views = byType("sw:View");
  const states = byType("sw:State");
  const transitions = byType("sw:Transition");
  const failures = byType("sw:FailureMode");
  const endpoints = byType("sw:Endpoint");
  const schemas = byType("sw:Schema");
  const nodes = byType("sw:Node");
  const unknown = allPrims.filter((p) => !KNOWN_TYPES.has(p.type_id));

  // Group entities by scope.
  const entitiesByScope = new Map<string, Primitive[]>();
  for (const e of entities) {
    const s = e.scope_id ?? "(unscoped)";
    const list = entitiesByScope.get(s) ?? [];
    list.push(e);
    entitiesByScope.set(s, list);
  }
  for (const list of entitiesByScope.values()) {
    list.sort((a, b) => {
      const ka = asString(a.field_values?.["kind"]);
      const kb = asString(b.field_values?.["kind"]);
      if (ka !== kb) return ka.localeCompare(kb);
      return asString(a.field_values?.["name"]).localeCompare(
        asString(b.field_values?.["name"]),
      );
    });
  }

  const sections: Section[] = [];
  const pushSection = (id: string, title: string, count: number) => {
    if (count > 0) sections.push({ id, title, count });
  };
  pushSection("sw-sec-stakeholders", "Stakeholders & Actors", stakeholders.length + actors.length);
  pushSection("sw-sec-viewpoints", "Viewpoints & Views", viewpoints.length + views.length);
  pushSection("sw-sec-concepts", "Concepts", concepts.length);
  pushSection("sw-sec-capabilities", "Capabilities", capabilities.length);
  pushSection("sw-sec-entities", "Entities", entities.length);
  pushSection("sw-sec-decisions", "Decisions (ADRs)", decisions.length);
  pushSection(
    "sw-sec-semantics",
    "Invariants · Constraints · Guarantees",
    invariants.length + constraints.length + guarantees.length,
  );
  pushSection("sw-sec-risks", "Risks", risks.length);
  pushSection("sw-sec-state-machines", "State machines", states.length + transitions.length + failures.length);
  pushSection("sw-sec-interfaces", "Interfaces", endpoints.length + schemas.length);
  pushSection("sw-sec-topology", "Topology", nodes.length);
  pushSection("sw-sec-evidence", "Evidence", evidence.length);
  pushSection("sw-sec-other", "Other", unknown.length);

  return (
    <div className="sw-doc">
      <nav className="sw-toc" aria-label="Sections">
        <div className="sw-toc-title">Architecture</div>
        <ol className="sw-toc-list">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>
                <span className="sw-toc-name">{s.title}</span>
                <span className="sw-toc-count">{s.count}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="sw-body">
        {(stakeholders.length > 0 || actors.length > 0) && (
          <section id="sw-sec-stakeholders" className="sw-section">
            <header className="sw-section-header">
              <h3>Stakeholders &amp; Actors</h3>
            </header>
            <div className="sw-grid">
              {stakeholders.map((p) => (
                <StakeholderCard key={p.id} primitive={p} />
              ))}
              {actors.map((p) => (
                <ActorCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}

        {(viewpoints.length > 0 || views.length > 0) && (
          <section id="sw-sec-viewpoints" className="sw-section">
            <header className="sw-section-header">
              <h3>Viewpoints &amp; Views</h3>
            </header>
            <div className="sw-grid">
              {viewpoints.map((p) => (
                <ViewpointCard key={p.id} primitive={p} />
              ))}
              {views.map((p) => (
                <ViewCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}

        {concepts.length > 0 && (
          <section id="sw-sec-concepts" className="sw-section">
            <header className="sw-section-header">
              <h3>Concepts ({concepts.length})</h3>
              <p className="sw-section-description">
                Ubiquitous language: named ideas requiring shared understanding.
              </p>
            </header>
            <div className="sw-grid">
              {concepts.map((p) => (
                <ConceptCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}

        {capabilities.length > 0 && (
          <section id="sw-sec-capabilities" className="sw-section">
            <header className="sw-section-header">
              <h3>Capabilities ({capabilities.length})</h3>
              <p className="sw-section-description">
                What the system delivers to its consumers.
              </p>
            </header>
            <div className="sw-grid">
              {capabilities.map((p) => (
                <CapabilityCard key={p.id} primitive={p} rels={rels} data={data} />
              ))}
            </div>
          </section>
        )}

        {entities.length > 0 && (
          <section id="sw-sec-entities" className="sw-section">
            <header className="sw-section-header">
              <h3>Entities ({entities.length})</h3>
              <p className="sw-section-description">
                Components, services, modules, libraries, datastores. Grouped by scope.
              </p>
            </header>
            {SCOPE_ORDER.map((scopeId) => {
              const list = entitiesByScope.get(scopeId);
              if (!list || list.length === 0) return null;
              return (
                <section key={scopeId} className="sw-scope-group">
                  <h4 className="sw-scope-title">
                    {SCOPE_LABELS[scopeId] ?? scopeId}{" "}
                    <span className="sw-scope-count">({list.length})</span>
                  </h4>
                  <div className="sw-grid">
                    {list.map((p) => (
                      <EntityCard key={p.id} primitive={p} rels={rels} data={data} />
                    ))}
                  </div>
                </section>
              );
            })}
            {/* Any entities outside the canonical scope set */}
            {[...entitiesByScope.entries()]
              .filter(([s]) => !SCOPE_ORDER.includes(s as (typeof SCOPE_ORDER)[number]))
              .map(([scopeId, list]) => (
                <section key={scopeId} className="sw-scope-group">
                  <h4 className="sw-scope-title">
                    {scopeId} <span className="sw-scope-count">({list.length})</span>
                  </h4>
                  <div className="sw-grid">
                    {list.map((p) => (
                      <EntityCard key={p.id} primitive={p} rels={rels} data={data} />
                    ))}
                  </div>
                </section>
              ))}
          </section>
        )}

        {decisions.length > 0 && (
          <section id="sw-sec-decisions" className="sw-section">
            <header className="sw-section-header">
              <h3>Decisions ({decisions.length})</h3>
              <p className="sw-section-description">
                Architectural Decision Records. Each carries context, rationale, alternatives, and consequences.
              </p>
            </header>
            <div className="sw-grid sw-grid-wide">
              {decisions.map((p) => (
                <DecisionCard key={p.id} primitive={p} rels={rels} data={data} />
              ))}
            </div>
          </section>
        )}

        {(invariants.length > 0 || constraints.length > 0 || guarantees.length > 0) && (
          <section id="sw-sec-semantics" className="sw-section">
            <header className="sw-section-header">
              <h3>
                Invariants · Constraints · Guarantees (
                {invariants.length + constraints.length + guarantees.length})
              </h3>
              <p className="sw-section-description">
                What must always hold, what is bounded, and what is committed to consumers.
              </p>
            </header>
            <div className="sw-grid">
              {invariants.map((p) => (
                <InvariantCard key={p.id} primitive={p} rels={rels} data={data} />
              ))}
              {constraints.map((p) => (
                <ConstraintCard key={p.id} primitive={p} rels={rels} data={data} />
              ))}
              {guarantees.map((p) => (
                <GuaranteeCard key={p.id} primitive={p} rels={rels} data={data} />
              ))}
            </div>
          </section>
        )}

        {risks.length > 0 && (
          <section id="sw-sec-risks" className="sw-section">
            <header className="sw-section-header">
              <h3>Risks ({risks.length})</h3>
              <p className="sw-section-description">
                Known architectural risks with likelihood, impact, and planned mitigation.
              </p>
            </header>
            <div className="sw-grid">
              {risks.map((p) => (
                <RiskCard key={p.id} primitive={p} rels={rels} data={data} />
              ))}
            </div>
          </section>
        )}

        {(states.length > 0 || transitions.length > 0 || failures.length > 0) && (
          <section id="sw-sec-state-machines" className="sw-section">
            <header className="sw-section-header">
              <h3>State machines &amp; failure modes ({states.length + transitions.length + failures.length})</h3>
            </header>
            <div className="sw-grid">
              {states.map((p) => (
                <StateCard key={p.id} primitive={p} />
              ))}
              {transitions.map((p) => (
                <TransitionCard key={p.id} primitive={p} data={data} />
              ))}
              {failures.map((p) => (
                <FailureModeCard key={p.id} primitive={p} rels={rels} data={data} />
              ))}
            </div>
          </section>
        )}

        {(endpoints.length > 0 || schemas.length > 0) && (
          <section id="sw-sec-interfaces" className="sw-section">
            <header className="sw-section-header">
              <h3>Interfaces ({endpoints.length + schemas.length})</h3>
            </header>
            <div className="sw-grid">
              {endpoints.map((p) => (
                <EndpointCard key={p.id} primitive={p} />
              ))}
              {schemas.map((p) => (
                <SchemaCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}

        {nodes.length > 0 && (
          <section id="sw-sec-topology" className="sw-section">
            <header className="sw-section-header">
              <h3>Topology ({nodes.length})</h3>
            </header>
            <div className="sw-grid">
              {nodes.map((p) => (
                <NodeCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}

        {evidence.length > 0 && (
          <section id="sw-sec-evidence" className="sw-section">
            <header className="sw-section-header">
              <h3>Evidence ({evidence.length})</h3>
              <p className="sw-section-description">
                Tests, references, metrics, reviews, certifications. Each justifies one or more claims above.
              </p>
            </header>
            <div className="sw-grid">
              {evidence.map((p) => (
                <EvidenceCard key={p.id} primitive={p} rels={rels} data={data} />
              ))}
            </div>
          </section>
        )}

        {unknown.length > 0 && (
          <section id="sw-sec-other" className="sw-section">
            <header className="sw-section-header">
              <h3>Other primitives ({unknown.length})</h3>
              <p className="sw-section-description">
                Types not enumerated by this template. Rendered with a generic field-list view.
              </p>
            </header>
            <div className="sw-grid">
              {unknown.map((p) => (
                <GenericCard key={p.id} primitive={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
