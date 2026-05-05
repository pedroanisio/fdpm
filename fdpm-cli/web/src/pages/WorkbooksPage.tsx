import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkbookSummary } from "../types";
import { WorkbookList } from "../components/WorkbookList";
import { SkeletonList } from "../components/Skeleton";
import { navigate } from "../App";

export function WorkbooksPage() {
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listWorkbooks()
      .then((r) => setWorkbooks(r.workbooks))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="error">
        <strong>Failed to load workbooks:</strong> {error}
        <p className="hint">
          Is the bridge running? <code>npm run dev:bridge</code>
        </p>
      </div>
    );
  }
  if (!workbooks) {
    return (
      <>
        <h1 className="page-title">Workbooks</h1>
        <SkeletonList count={5} variant="workbook" />
      </>
    );
  }
  return (
    <>
      <h1 className="page-title">Workbooks <span className="page-count">({workbooks.length})</span></h1>
      <WorkbookList workbooks={workbooks} onSelect={(id) => navigate(`#/wb/${encodeURIComponent(id)}`)} />
    </>
  );
}
