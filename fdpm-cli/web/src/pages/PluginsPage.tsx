import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { PluginSummary } from "../types";
import { SkeletonList } from "../components/Skeleton";
import { EmptyState, ErrorState } from "../components/AsyncState";

export function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");

  const load = useCallback(() => {
    setError(null);
    setPlugins(null);
    void api
      .listPlugins()
      .then((response) => setPlugins(response.plugins))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(load, [load]);

  const states = useMemo(
    () => [...new Set((plugins ?? []).map((plugin) => plugin.state))].sort(),
    [plugins],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (plugins ?? []).filter((plugin) => {
      const matchesState = state === "all" || plugin.state === state;
      const matchesQuery =
        !normalized ||
        [plugin.id, prettyName(plugin.id), plugin.kind, plugin.trust].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        );
      return matchesState && matchesQuery;
    });
  }, [plugins, query, state]);

  if (error) {
    return <ErrorState title="Plugins could not be loaded" error={error} onRetry={load} />;
  }

  if (!plugins) {
    return (
      <>
        <PageHeader />
        <SkeletonList count={6} variant="plugin" />
      </>
    );
  }

  const clearFilters = () => {
    setQuery("");
    setState("all");
  };

  return (
    <section aria-labelledby="plugins-title">
      <PageHeader id="plugins-title" />
      <div className="catalog-toolbar" role="search" aria-label="Filter plugins">
        <label className="filter-field filter-field-grow">
          <span>Search plugins</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, ID, kind, or trust"
          />
        </label>
        <label className="filter-field">
          <span>Filter by state</span>
          <select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="all">All states</option>
            {states.map((pluginState) => (
              <option key={pluginState} value={pluginState}>{pluginState}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="catalog-summary" aria-live="polite">
        Showing <strong>{filtered.length}</strong> of <strong>{plugins.length}</strong> plugins
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={plugins.length === 0 ? "No plugins are registered" : "No plugins match these filters."}
          description={
            plugins.length === 0
              ? "Confirm plugin discovery is enabled, then retry."
              : "Try a broader term or include every state."
          }
          action={
            <button type="button" className="button" onClick={plugins.length === 0 ? load : clearFilters}>
              {plugins.length === 0 ? "Refresh catalog" : "Clear filters"}
            </button>
          }
        />
      ) : (
        <ul className="plugin-list">
          {filtered.map((plugin) => (
            <li key={plugin.id}>
              <a className="plugin-card" href={`#/plugin/${encodeURIComponent(plugin.id)}`}>
                <div className="plugin-card-head">
                  <div className="plugin-card-name">{prettyName(plugin.id)}</div>
                  <span className={`plugin-state plugin-state-${plugin.state}`}>{plugin.state}</span>
                </div>
                <div className="plugin-card-meta">
                  <code>{plugin.id}</code>
                  <span className="sep">·</span>
                  <span>v{plugin.version}</span>
                  <span className="sep">·</span>
                  <span>{plugin.kind}</span>
                  <span className="sep">·</span>
                  <span>trust: {plugin.trust}</span>
                  <span className="sep">·</span>
                  <span className="meta-stat">
                    <strong>{plugin.capabilities}</strong> capabilit{plugin.capabilities === 1 ? "y" : "ies"}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PageHeader({ id }: { id?: string }) {
  return (
    <header className="page-header">
      <p className="page-kicker">Runtime extensions</p>
      <h1 className="page-title" id={id}>Plugins</h1>
      <p className="page-lede">Inspect the profiles, capabilities, permissions, and source each extension contributes.</p>
    </header>
  );
}

/** Title-case the local part of `fdpm.<name>` for the card heading. */
function prettyName(id: string): string {
  const local = id.replace(/^fdpm\./, "");
  return local
    .split(/[-_]/)
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}
