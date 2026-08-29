/**
 * uml:ModelOutlineRenderer — the whole model as one readable document.
 *
 * The per-entity renderers the bridge derives print field tables, one
 * primitive at a time. That is the wrong unit for UML: a reader needs
 * the containment tree with each classifier's features inlined in
 * declaration order, and the typed edges resolved to names rather than
 * ids. This renderer walks uml:Owns from the roots and reads the other
 * eleven relation types to print UML's own notation
 * (`+ name : Type [0..*]`), so the rendered file is diffable review
 * material rather than a dump.
 */

import type { RendererInput, RendererOutput } from "../../../src/plugin/types.js";
import { REL } from "../sidecar.js";
import { UNLIMITED } from "../schemas/uml-foundation.js";

interface Prim {
  id: string;
  type_id: string;
  field_values: Record<string, unknown>;
}
interface Rel {
  id: string;
  type_id: string;
  source_id: string;
  target_id: string;
  field_values?: Record<string, unknown>;
}

const VIS: Record<string, string> = { public: "+", private: "-", protected: "#", package: "~" };

function fv(p: Prim | undefined, key: string): string {
  const v = p?.field_values?.[key];
  return typeof v === "string" ? v : "";
}
function bool(p: Prim | undefined, key: string): boolean {
  return p?.field_values?.[key] === true;
}
function num(p: Prim | undefined, key: string, dflt: number): number {
  const v = p?.field_values?.[key];
  return typeof v === "number" ? v : dflt;
}
/** `uml:PrimitiveType` → "primitive type" — the UML metaclass, read aloud. */
function kindLabel(typeId: string): string {
  const tail = typeId.split(":").pop() ?? "";
  return tail.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

function displayName(p: Prim | undefined): string {
  if (!p) return "?";
  const n = fv(p, "name");
  return n !== "" ? n : `«${p.type_id.split(":").pop() ?? "?"} ${p.id.split(":").pop() ?? ""}»`;
}

/** UML multiplicity notation: 1, 0..1, 0..*, 2..5. */
function multiplicity(p: Prim): string {
  const lower = num(p, "lower", 1);
  const upper = num(p, "upper", 1);
  if (lower === 1 && upper === 1) return "";
  const hi = upper === UNLIMITED ? "*" : String(upper);
  return lower === upper ? ` [${hi}]` : ` [${lower}..${hi}]`;
}

export function renderModelOutline(input: RendererInput): RendererOutput {
  const primitives = input.primitives as unknown as Prim[];
  const relations = (input.relations ?? []) as unknown as Rel[];
  const byId = new Map<string, Prim>(primitives.map((p) => [p.id, p]));

  const out = (type: string): Rel[] => relations.filter((r) => r.type_id === type);
  const targetsOf = (type: string, source: string): Rel[] =>
    out(type).filter((r) => r.source_id === source);
  const sourcesOf = (type: string, target: string): Rel[] =>
    out(type).filter((r) => r.target_id === target);
  const ordered = (rels: Rel[]): Rel[] =>
    rels
      .slice()
      .sort(
        (a, b) =>
          Number(a.field_values?.["position"] ?? Number.MAX_SAFE_INTEGER) -
            Number(b.field_values?.["position"] ?? Number.MAX_SAFE_INTEGER) ||
          a.target_id.localeCompare(b.target_id),
      );

  const typeName = (elementId: string): string => {
    const edge = targetsOf(REL.TypedBy, elementId)[0];
    return edge ? displayName(byId.get(edge.target_id)) : "";
  };

  const lines: string[] = [];
  const owned = new Set(out(REL.Owns).map((r) => r.target_id));
  const roots = primitives
    .filter((p) => (p.type_id === "uml:Model" || p.type_id === "uml:Package") && !owned.has(p.id))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));

  lines.push(`# ${input.workbook?.name ?? "UML model"}`, "");
  lines.push(
    `_Profile \`${input.workbook?.profile_id ?? "profile:uml:2.5"}\` — ${primitives.length} elements, ${relations.length} relationships._`,
    "",
  );

  function renderFeatures(owner: Prim, depth: number): void {
    const pad = "  ".repeat(depth);
    // An association's `ownedEnd` is both owned and a member end. The
    // ends are printed by renderElement; listing them again as
    // attributes would show the same Property twice.
    const asEnd = new Set(targetsOf(REL.MemberEnd, owner.id).map((r) => r.target_id));
    const attrs = ordered(targetsOf(REL.OwnsAttribute, owner.id)).filter((r) => !asEnd.has(r.target_id));
    const ops = ordered(targetsOf(REL.OwnsOperation, owner.id));
    const literals = ordered(targetsOf(REL.OwnsLiteral, owner.id));
    const receptions = ordered(targetsOf(REL.OwnsReception, owner.id));
    const ports = ordered(targetsOf(REL.OwnsPort, owner.id));

    for (const edge of literals) {
      const lit = byId.get(edge.target_id);
      if (lit) lines.push(`${pad}- \`${displayName(lit)}\``);
    }
    // A port is an attribute on the classifier's boundary: type first,
    // then the contract it publishes (§11.3).
    for (const edge of ports) {
      const pt = byId.get(edge.target_id);
      if (!pt) continue;
      const t = typeName(pt.id);
      const provided = targetsOf(REL.Provides, pt.id).map((r) => displayName(byId.get(r.target_id)));
      const required = targetsOf(REL.Requires, pt.id).map((r) => displayName(byId.get(r.target_id)));
      const marks = [
        bool(pt, "is_conjugated") ? "conjugated" : "",
        bool(pt, "is_behavior") ? "behavior" : "",
        pt.field_values["is_service"] === false ? "not a service" : "",
      ].filter((m) => m !== "");
      lines.push(
        `${pad}- \`«port» ${displayName(pt)}${t ? ` : ${t}` : ""}${multiplicity(pt)}\`` +
          (provided.length ? ` — provides: ${provided.join(", ")}` : "") +
          (required.length ? `${provided.length ? ";" : " —"} requires: ${required.join(", ")}` : "") +
          (marks.length ? ` _{${marks.join(", ")}}_` : ""),
      );
    }
    for (const edge of attrs) {
      const a = byId.get(edge.target_id);
      if (!a) continue;
      const t = typeName(a.id);
      const marks = [
        bool(a, "is_static") ? "static" : "",
        bool(a, "is_read_only") ? "readOnly" : "",
        bool(a, "is_derived") ? "derived" : "",
        bool(a, "is_id") ? "id" : "",
        fv(a, "aggregation") !== "none" && fv(a, "aggregation") !== "" ? fv(a, "aggregation") : "",
      ].filter((m) => m !== "");
      const dflt = a.field_values["default_value"] as { body?: string } | undefined;
      lines.push(
        `${pad}- \`${VIS[fv(a, "visibility")] ?? "+"} ${displayName(a)}${t ? ` : ${t}` : ""}${multiplicity(a)}\`` +
          (dflt?.body ? ` = \`${dflt.body}\`` : "") +
          (marks.length ? ` _{${marks.join(", ")}}_` : ""),
      );
    }
    // UML prints a reception as a «signal»-stereotyped feature naming the
    // signal it reacts to (§11.4).
    for (const edge of receptions) {
      const r = byId.get(edge.target_id);
      if (!r) continue;
      const sig = targetsOf(REL.Signals, r.id)[0];
      const sigName = sig ? displayName(byId.get(sig.target_id)) : "";
      lines.push(
        `${pad}- \`«signal» ${displayName(r)}\`` +
          (sigName && sigName !== displayName(r) ? ` → ${sigName}` : "") +
          (bool(r, "is_static") ? " _{static}_" : ""),
      );
    }
    for (const edge of ops) {
      const o = byId.get(edge.target_id);
      if (!o) continue;
      const params = ordered(targetsOf(REL.OwnsParameter, o.id))
        .map((pe) => byId.get(pe.target_id))
        .filter((p): p is Prim => p !== undefined);
      const returns = params.filter((p) => fv(p, "direction") === "return");
      const args = params
        .filter((p) => fv(p, "direction") !== "return")
        .map((p) => {
          const dir = fv(p, "direction");
          const t = typeName(p.id);
          return `${dir && dir !== "in" ? `${dir} ` : ""}${displayName(p)}${t ? `: ${t}` : ""}${multiplicity(p)}`;
        })
        .join(", ");
      const ret = returns[0] ? `${typeName(returns[0].id) || "void"}${multiplicity(returns[0])}` : "";
      const marks = [
        bool(o, "is_abstract") ? "abstract" : "",
        bool(o, "is_static") ? "static" : "",
        bool(o, "is_query") ? "query" : "",
      ].filter((m) => m !== "");
      lines.push(
        `${pad}- \`${VIS[fv(o, "visibility")] ?? "+"} ${displayName(o)}(${args})${ret ? ` : ${ret}` : ""}\`` +
          (marks.length ? ` _{${marks.join(", ")}}_` : ""),
      );
    }
  }

  function renderElement(p: Prim, depth: number): void {
    const kind = p.type_id.split(":").pop() ?? "";
    const heading = "#".repeat(Math.min(depth + 2, 6));
    const generals = targetsOf(REL.Specializes, p.id).map((r) => displayName(byId.get(r.target_id)));
    const realized = targetsOf(REL.Realizes, p.id).map((r) => displayName(byId.get(r.target_id)));
    const stereo = [
      bool(p, "is_abstract") ? "abstract" : "",
      bool(p, "is_active") ? "active" : "",
      bool(p, "is_derived") && kind === "Association" ? "derived" : "",
    ].filter((s) => s !== "");

    lines.push(
      "",
      `${heading} «${kindLabel(p.type_id)}» ${displayName(p)}${stereo.length ? ` _{${stereo.join(", ")}}_` : ""}`,
      "",
    );
    if (generals.length > 0) lines.push(`_specializes:_ ${generals.join(", ")}  `);
    if (realized.length > 0) lines.push(`_realizes:_ ${realized.join(", ")}  `);
    const deps = targetsOf(REL.DependsOn, p.id);
    if (deps.length > 0) {
      lines.push(
        `_depends on:_ ${deps
          .map((d) => `${displayName(byId.get(d.target_id))} (${String(d.field_values?.["kind"] ?? "dependency")})`)
          .join(", ")}  `,
      );
    }
    for (const c of sourcesOf(REL.Constrains, p.id)) {
      const con = byId.get(c.source_id);
      const spec = con?.field_values["specification"] as { body?: string; language?: string } | undefined;
      if (spec?.body) lines.push(`_constraint_ \`{${spec.body}}\`${spec.language ? ` (${spec.language})` : ""}  `);
    }
    for (const a of sourcesOf(REL.Annotates, p.id)) {
      const note = byId.get(a.source_id);
      const body = fv(note, "body");
      if (body) lines.push(`> ${body.replace(/\n/g, "\n> ")}`, "");
    }

    if (kind === "Association") {
      const ends = ordered(targetsOf(REL.MemberEnd, p.id));
      for (const e of ends) {
        const end = byId.get(e.target_id);
        if (!end) continue;
        const nav = e.field_values?.["is_navigable"] === true ? " →" : "";
        lines.push(
          `- end \`${displayName(end)} : ${typeName(end.id) || "?"}${multiplicity(end)}\`${nav}` +
            (fv(end, "aggregation") !== "none" && fv(end, "aggregation") !== ""
              ? ` _{${fv(end, "aggregation")}}_`
              : ""),
        );
      }
    }
    const provided = targetsOf(REL.Provides, p.id).map((r) => displayName(byId.get(r.target_id)));
    const required = targetsOf(REL.Requires, p.id).map((r) => displayName(byId.get(r.target_id)));
    if (provided.length > 0) lines.push(`_provides:_ ${provided.join(", ")}  `);
    if (required.length > 0) lines.push(`_requires:_ ${required.join(", ")}  `);
    const realizedBy = sourcesOf(REL.RealizesComponent, p.id).map((r) => displayName(byId.get(r.source_id)));
    if (realizedBy.length > 0) lines.push(`_realized by:_ ${realizedBy.join(", ")}  `);
    const manifests = targetsOf(REL.Manifests, p.id).map((r) => displayName(byId.get(r.target_id)));
    if (manifests.length > 0) lines.push(`_manifests:_ ${manifests.join(", ")}  `);
    const fileName = fv(p, "file_name");
    if (fileName !== "") lines.push(`_file:_ \`${fileName}\`  `);

    renderFeatures(p, 0);

    // Connectors: each reads as the pair of roles it joins (§11.2).
    for (const edge of ordered(targetsOf(REL.OwnsConnector, p.id))) {
      const conn = byId.get(edge.target_id);
      if (!conn) continue;
      const ends = ordered(targetsOf(REL.OwnsConnectorEnd, conn.id)).map((e) => {
        const end = byId.get(e.target_id);
        if (!end) return "?";
        const role = targetsOf(REL.ConnectorRole, end.id)[0];
        const part = targetsOf(REL.PartWithPort, end.id)[0];
        const roleName = role ? displayName(byId.get(role.target_id)) : "?";
        const partName = part ? displayName(byId.get(part.target_id)) : "";
        return `${partName ? `${partName}.` : ""}${roleName}${multiplicity(end)}`;
      });
      lines.push(
        `- \`«connector» ${displayName(conn)}\` (${fv(conn, "kind") || "assembly"}): ${ends.join(" ↔ ")}`,
      );
    }

    const children = targetsOf(REL.Owns, p.id)
      .map((r) => byId.get(r.target_id))
      .filter((c): c is Prim => c !== undefined)
      .sort((a, b) => a.type_id.localeCompare(b.type_id) || displayName(a).localeCompare(displayName(b)));
    for (const child of children) renderElement(child, depth + 1);
  }

  if (roots.length === 0) lines.push("_(no uml:Model or uml:Package root — nothing to outline)_", "");
  for (const root of roots) renderElement(root, 0);

  const orphans = primitives
    .filter(
      (p) =>
        !owned.has(p.id) &&
        p.type_id !== "uml:Model" &&
        p.type_id !== "uml:Package" &&
        targetsOf(REL.OwnsAttribute, p.id).length === 0 &&
        sourcesOf(REL.OwnsAttribute, p.id).length === 0 &&
        sourcesOf(REL.OwnsOperation, p.id).length === 0 &&
        sourcesOf(REL.OwnsParameter, p.id).length === 0 &&
        sourcesOf(REL.OwnsLiteral, p.id).length === 0 &&
        sourcesOf(REL.MemberEnd, p.id).length === 0 &&
        sourcesOf(REL.Annotates, p.id).length === 0 &&
        sourcesOf(REL.Constrains, p.id).length === 0 &&
        targetsOf(REL.Annotates, p.id).length === 0 &&
        targetsOf(REL.Constrains, p.id).length === 0,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  if (orphans.length > 0) {
    lines.push("", "## Unowned elements", "");
    for (const o of orphans) lines.push(`- \`${o.type_id}\` ${displayName(o)} (\`${o.id}\`)`);
  }

  return {
    bytes: new TextEncoder().encode(lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"),
    contentType: "text/markdown",
    filename: "uml-model.md",
  };
}
