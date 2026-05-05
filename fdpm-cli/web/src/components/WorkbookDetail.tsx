import { useEffect, useState } from "react";
import { api } from "../api";
import type { Primitive, WorkbookDetailResponse } from "../types";
import { PrimitiveCard } from "./PrimitiveCard";
import { pickTemplate } from "../templates";

interface Props {
  id: string;
  onBack: () => void;
}

function groupByType(prims: Record<string, Primitive>): Map<string, Primitive[]> {
  const out = new Map<string, Primitive[]>();
  for (const p of Object.values(prims)) {
    const list = out.get(p.type_id) ?? [];
    list.push(p);
    out.set(p.type_id, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function WorkbookDetail({ id, onBack }: Props) {
  const [data, setData] = useState<WorkbookDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api
      .getWorkbook(id)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="error">
        <button onClick={onBack} className="back">← Back</button>
        <strong>Failed to load workbook {id}:</strong> {error}
      </div>
    );
  }
  if (!data) return <div className="loading">Loading {id}…</div>;

  const total = Object.keys(data.primitives).length;
  const relCount = Array.isArray(data.relations)
    ? data.relations.length
    : data.relations
    ? Object.keys(data.relations).length
    : 0;

  const template = pickTemplate(data.workbook.profile_id);
  const TemplateComponent = template?.component;

  return (
    <div className="workbook-detail">
      <button onClick={onBack} className="back">← Back</button>
      <header className="detail-header">
        <h2>{data.workbook.name}</h2>
        <div className="detail-meta">
          <code>{data.workbook.id}</code>
          <span className="sep">·</span>
          <span>{data.workbook.profile_id}</span>
          <span className="sep">·</span>
          <span>rev {data.workbook.revision}</span>
          <span className="sep">·</span>
          <span>{total} primitives</span>
          {relCount > 0 && (
            <>
              <span className="sep">·</span>
              <span>{relCount} relations</span>
            </>
          )}
          {template && (
            <>
              <span className="sep">·</span>
              <span className="template-tag">template: {template.label}</span>
            </>
          )}
        </div>
        {data.workbook.description && (
          <p className="detail-description">{data.workbook.description}</p>
        )}
      </header>

      {TemplateComponent ? (
        <TemplateComponent data={data} />
      ) : (
        <GenericGrouped data={data} />
      )}
    </div>
  );
}

function GenericGrouped({ data }: { data: WorkbookDetailResponse }) {
  const groups = groupByType(data.primitives);
  return (
    <>
      {[...groups.entries()].map(([typeId, items]) => (
        <section key={typeId} className="type-group">
          <h3>
            {typeId} <span className="count">({items.length})</span>
          </h3>
          <div className="primitive-grid">
            {items.map((p) => (
              <PrimitiveCard key={p.id} primitive={p} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
