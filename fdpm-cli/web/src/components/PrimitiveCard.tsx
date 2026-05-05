import type { Primitive } from "../types";

interface Props {
  primitive: Primitive;
}

function renderValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

const TITLE_KEYS = ["name", "title", "summary", "label"];

function pickTitle(fields: Record<string, unknown>): string | null {
  for (const k of TITLE_KEYS) {
    const v = fields[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

export function PrimitiveCard({ primitive }: Props) {
  const fields = primitive.field_values ?? {};
  const title = pickTitle(fields);
  const otherKeys = Object.keys(fields).filter((k) => !(title && k === TITLE_KEYS.find((tk) => fields[tk] === title)));

  return (
    <article className="primitive-card">
      <header>
        {title && <div className="primitive-title">{title}</div>}
        <div className="primitive-id">
          <code>{primitive.id}</code>
        </div>
      </header>
      {otherKeys.length > 0 && (
        <dl className="primitive-fields">
          {otherKeys.map((k) => (
            <div key={k} className="field">
              <dt>{k}</dt>
              <dd>{renderValue(fields[k])}</dd>
            </div>
          ))}
        </dl>
      )}
      <footer className="primitive-footer">
        rev {primitive.revision}
        {primitive.scope_id && (
          <>
            <span className="sep">·</span>
            <span>{primitive.scope_id}</span>
          </>
        )}
      </footer>
    </article>
  );
}
