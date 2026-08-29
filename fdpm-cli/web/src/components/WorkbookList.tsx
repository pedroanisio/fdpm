import type { WorkbookSummary } from "../types";

interface Props {
  workbooks: WorkbookSummary[];
  onSelect: (id: string) => void;
}

export function WorkbookList({ workbooks, onSelect }: Props) {
  if (workbooks.length === 0) {
    return (
      <div className="empty compact-empty">
        <strong>No workbooks yet.</strong> Create the first one with <code>fdpm workbook create</code>.
      </div>
    );
  }
  return (
    <ul className="workbook-list">
      {workbooks.map((w) => (
        <li key={w.id}>
          <button
            className="workbook-card"
            onClick={() => onSelect(w.id)}
            aria-label={`Open ${w.name}, ${w.profile_id}, revision ${w.revision}`}
          >
            <div className="workbook-card-name">{w.name}</div>
            <div className="workbook-card-meta">
              <code>{w.id}</code>
              <span className="sep">·</span>
              <span>{w.profile_id}</span>
              <span className="sep">·</span>
              <span className="meta-stat"><strong>rev</strong> {w.revision}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
