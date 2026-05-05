import { useEffect, useState } from "react";
import { api } from "../api";
import type { PluginSummary } from "../types";
import { SkeletonList } from "../components/Skeleton";

export function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPlugins()
      .then((r) => setPlugins(r.plugins))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="error">
        <strong>Failed to load plugins:</strong> {error}
      </div>
    );
  }
  if (!plugins) {
    return (
      <>
        <h1 className="page-title">Plugins</h1>
        <p className="page-lede">
          Each plugin contributes profiles, primitive/relation types, validators, and renderers
          to the FDPM host. Click a plugin to see what it actually ships.
        </p>
        <SkeletonList count={6} variant="plugin" />
      </>
    );
  }
  return (
    <>
      <h1 className="page-title">
        Plugins <span className="page-count">({plugins.length})</span>
      </h1>
      <p className="page-lede">
        Each plugin contributes profiles, primitive/relation types, validators, and renderers
        to the FDPM host. Click a plugin to see what it actually ships.
      </p>
      <ul className="plugin-list">
        {plugins.map((p) => (
          <li key={p.id}>
            <a className="plugin-card" href={`#/plugin/${encodeURIComponent(p.id)}`}>
              <div className="plugin-card-head">
                <div className="plugin-card-name">{prettyName(p.id)}</div>
                <span className={`plugin-state plugin-state-${p.state}`}>{p.state}</span>
              </div>
              <div className="plugin-card-meta">
                <code>{p.id}</code>
                <span className="sep">·</span>
                <span>v{p.version}</span>
                <span className="sep">·</span>
                <span>{p.kind}</span>
                <span className="sep">·</span>
                <span>trust: {p.trust}</span>
                <span className="sep">·</span>
                <span>
                  {p.capabilities} capabilit{p.capabilities === 1 ? "y" : "ies"}
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Title-case the local part of `fdpm.<name>` for the card heading. */
function prettyName(id: string): string {
  const local = id.replace(/^fdpm\./, "");
  return local
    .split(/[-_]/)
    .map((s) => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)))
    .join(" ");
}
