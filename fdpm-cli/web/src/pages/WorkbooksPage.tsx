import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { WorkbookSummary } from "../types";
import { WorkbookList } from "../components/WorkbookList";
import { SkeletonList } from "../components/Skeleton";
import { navigate } from "../App";
import { EmptyState, ErrorState } from "../components/AsyncState";

export function WorkbooksPage() {
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState("all");

  const load = useCallback(() => {
    setError(null);
    setWorkbooks(null);
    void api
      .listWorkbooks()
      .then((response) => setWorkbooks(response.workbooks))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(load, [load]);

  const profiles = useMemo(
    () => [...new Set((workbooks ?? []).map((workbook) => workbook.profile_id))].sort(),
    [workbooks],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (workbooks ?? []).filter((workbook) => {
      const matchesProfile = profile === "all" || workbook.profile_id === profile;
      const matchesQuery =
        !normalized ||
        [workbook.name, workbook.id, workbook.profile_id].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        );
      return matchesProfile && matchesQuery;
    });
  }, [profile, query, workbooks]);

  const clearFilters = () => {
    setQuery("");
    setProfile("all");
  };

  if (error) {
    return (
      <ErrorState
        title="Workbooks could not be loaded"
        error={error}
        onRetry={load}
        context={<p className="async-state-context">The local FDPM bridge did not return the catalog.</p>}
      />
    );
  }

  if (!workbooks) {
    return (
      <>
        <PageHeader />
        <SkeletonList count={5} variant="workbook" />
      </>
    );
  }

  return (
    <section aria-labelledby="workbooks-title">
      <PageHeader id="workbooks-title" />

      {workbooks.length === 0 ? (
        <EmptyState
          title="No workbooks yet"
          description={
            <>
              Create the first workbook with <code>fdpm workbook create</code>, then refresh this page.
            </>
          }
          action={<button type="button" className="button" onClick={load}>Refresh catalog</button>}
        />
      ) : (
        <>
          <div className="catalog-toolbar" role="search" aria-label="Filter workbooks">
            <label className="filter-field filter-field-grow">
              <span>Search workbooks</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, ID, or profile"
              />
            </label>
            <label className="filter-field">
              <span>Filter by profile</span>
              <select value={profile} onChange={(event) => setProfile(event.target.value)}>
                <option value="all">All profiles</option>
                {profiles.map((profileId) => (
                  <option key={profileId} value={profileId}>{profileId}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="catalog-summary" aria-live="polite">
            Showing <strong>{filtered.length}</strong> of <strong>{workbooks.length}</strong> workbooks
          </div>
          {filtered.length > 0 ? (
            <WorkbookList
              workbooks={filtered}
              onSelect={(id) => navigate(`#/wb/${encodeURIComponent(id)}`)}
            />
          ) : (
            <EmptyState
              title="No workbooks match these filters."
              description="Try a broader term or return to all profiles."
              action={<button type="button" className="button" onClick={clearFilters}>Clear filters</button>}
            />
          )}
        </>
      )}
    </section>
  );
}

function PageHeader({ id }: { id?: string }) {
  return (
    <header className="page-header">
      <p className="page-kicker">Local knowledge store</p>
      <h1 className="page-title" id={id}>Workbooks</h1>
      <p className="page-lede">Browse typed, revisioned workbooks and open the view designed for each profile.</p>
    </header>
  );
}
