import { useEffect, useState } from "react";
import { api } from "../api";
import type {
  CapabilityDecl,
  PluginManifest,
  PluginRecord,
  ProfileSummary,
  WorkbookSummary,
} from "../types";
import { Markdown } from "../components/Markdown";

interface Props {
  id: string;
}

interface Bundle {
  record: PluginRecord;
  manifest: PluginManifest;
  readme: string | null;
  profiles: ProfileSummary[];
  workbooks: WorkbookSummary[];
}

const PERMISSION_CAPTIONS: Record<string, string> = {
  "read:workbooks": "Read workbook metadata and listings",
  "read:primitives": "Read primitive instances",
  "read:relations": "Read relation instances",
  "render:server": "Render workbooks via registered renderers",
  "import:workbook": "Import workbooks from a transfer file",
  "export:workbook": "Export workbooks to a transfer file",
  "write:workbooks": "Create / mutate workbooks",
  "write:primitives": "Create / mutate primitives",
  "write:relations": "Create / mutate relations",
};

const CAPABILITY_GROUP_LABELS: Record<string, string> = {
  "cap:profile": "Profile",
  "cap:lifecycle-hook": "Lifecycle hooks",
  "cap:renderer": "Renderers",
  "cap:validator": "Validators",
  "cap:transformer": "Transformers",
  "cap:importer": "Importers",
  "cap:exporter": "Exporters",
  "cap:expression-helper": "Expression helpers",
};

function groupCapabilities(caps: CapabilityDecl[]): Map<string, CapabilityDecl[]> {
  const out = new Map<string, CapabilityDecl[]>();
  for (const c of caps) {
    const list = out.get(c.capability_id) ?? [];
    list.push(c);
    out.set(c.capability_id, list);
  }
  // Order: profile first, then renderers/validators/etc, then lifecycle last.
  const order = [
    "cap:profile",
    "cap:renderer",
    "cap:validator",
    "cap:transformer",
    "cap:importer",
    "cap:exporter",
    "cap:expression-helper",
    "cap:lifecycle-hook",
  ];
  return new Map(
    [...out.entries()].sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }),
  );
}

export function PluginDetailPage({ id }: Props) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBundle(null);
    setError(null);
    Promise.all([
      api.getPlugin(id),
      api.getPluginManifest(id),
      api.getPluginReadme(id),
      api.listProfiles(),
      api.listWorkbooks(),
    ])
      .then(([record, manifest, readme, profilesResp, workbooksResp]) =>
        setBundle({
          record,
          manifest,
          readme: readme?.markdown ?? null,
          profiles: profilesResp.profiles,
          workbooks: workbooksResp.workbooks,
        }),
      )
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="error">
        <a href="#/plugins" className="back">← Plugins</a>
        <strong>Failed to load plugin {id}:</strong> {error}
      </div>
    );
  }
  if (!bundle) return <div className="loading">Loading {id}…</div>;

  const { record, manifest, readme, profiles, workbooks } = bundle;
  const groups = groupCapabilities(record.capabilities);
  const contributedProfileIds = new Set(record.contributions.profiles);
  const contributedProfiles = profiles.filter((p) => contributedProfileIds.has(p.id));

  return (
    <article className="plugin-detail">
      <a href="#/plugins" className="back">← Plugins</a>

      <header className="plugin-hero">
        <div className="plugin-hero-head">
          <h1>{manifest.name}</h1>
          <span className={`plugin-state plugin-state-${record.state}`}>{record.state}</span>
        </div>
        <div className="plugin-hero-meta">
          <code>{record.id}</code>
          <span className="sep">·</span>
          <span>v{record.version}</span>
          <span className="sep">·</span>
          <span>{record.kind}</span>
          {record.trust && (
            <>
              <span className="sep">·</span>
              <span>trust: {record.trust}</span>
            </>
          )}
          {manifest.license && (
            <>
              <span className="sep">·</span>
              <span>{manifest.license}</span>
            </>
          )}
        </div>
        {manifest.description && <p className="plugin-hero-description">{manifest.description}</p>}
        {manifest.authors && manifest.authors.length > 0 && (
          <div className="plugin-hero-authors">By {manifest.authors.join(", ")}</div>
        )}
      </header>

      <ContributionsSummary record={record} />

      {contributedProfiles.length > 0 && (
        <section className="plugin-section">
          <h3>Profiles</h3>
          <p className="plugin-section-lede">
            Domain profiles this plugin registers. Click a profile to see its primitive types and
            relation types.
          </p>
          <div className="profile-cards">
            {contributedProfiles.map((p) => {
              const using = workbooks.filter((w) => w.profile_id === p.id);
              return (
                <a
                  key={p.id}
                  className="profile-card"
                  href={`#/profile/${encodeURIComponent(p.id)}`}
                >
                  <div className="profile-card-name">{p.label}</div>
                  <div className="profile-card-id"><code>{p.id}</code></div>
                  <div className="profile-card-counts">
                    <span><strong>{p.primitive_type_count}</strong> primitive types</span>
                    <span className="sep">·</span>
                    <span><strong>{p.relation_type_count}</strong> relation types</span>
                  </div>
                  <div className="profile-card-using">
                    {using.length === 0
                      ? "No workbooks in this store use this profile."
                      : `Used by ${using.length} workbook${using.length === 1 ? "" : "s"} in this store.`}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <section className="plugin-section">
        <h3>Capabilities <span className="count">({record.capabilities.length})</span></h3>
        {[...groups.entries()].map(([capId, caps]) => (
          <div key={capId} className="capability-group">
            <h4>
              {CAPABILITY_GROUP_LABELS[capId] ?? capId}
              <code className="capability-group-id">{capId}</code>
              <span className="count">({caps.length})</span>
            </h4>
            <ul className="capability-list">
              {caps.map((c) => (
                <li key={`${c.capability_id}:${c.local_name}`}>
                  <div className="capability-name">{c.local_name}</div>
                  <div className="capability-meta">
                    entry: <code>{c.entry}</code>
                  </div>
                  {c.metadata && <CapabilityMetadata metadata={c.metadata} />}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {record.permissions.length > 0 && (
        <section className="plugin-section">
          <h3>Permissions</h3>
          <ul className="permission-list">
            {record.permissions.map((perm) => (
              <li key={perm}>
                <code>{perm}</code>
                <span className="permission-caption">
                  {PERMISSION_CAPTIONS[perm] ?? "(undocumented permission)"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {readme && (
        <section className="plugin-section">
          <h3>README</h3>
          <Markdown source={readme} />
        </section>
      )}

      <section className="plugin-section">
        <h3>Source</h3>
        <dl className="kv">
          <div><dt>kind</dt><dd>{record.source.kind}</dd></div>
          <div><dt>builtin</dt><dd>{record.source.builtin ? "yes" : "no"}</dd></div>
          <div><dt>root</dt><dd><code>{record.source.root}</code></dd></div>
          <div><dt>manifest</dt><dd><code>{record.source.manifestPath}</code></dd></div>
        </dl>
      </section>

      <section className="plugin-section">
        <details>
          <summary><h3 style={{ display: "inline" }}>Raw manifest (fdpm-plugin.json)</h3></summary>
          <pre className="raw-manifest">{JSON.stringify(manifest, null, 2)}</pre>
        </details>
      </section>
    </article>
  );
}

function ContributionsSummary({ record }: { record: PluginRecord }) {
  const c = record.contributions;
  const items: Array<[string, number]> = [
    ["profiles", c.profiles.length],
    ["validators", c.validators],
    ["renderers", c.renderers],
    ["transformers", c.transformers],
    ["importers", c.importers],
    ["exporters", c.exporters],
  ];
  const nonzero = items.filter(([, n]) => n > 0);
  if (nonzero.length === 0) return null;
  return (
    <section className="plugin-section">
      <h3>What it contributes</h3>
      <div className="contributions">
        {nonzero.map(([k, n]) => (
          <div key={k} className="contribution">
            <div className="contribution-num">{n}</div>
            <div className="contribution-label">{k}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CapabilityMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return null;
  return (
    <dl className="capability-metadata">
      {entries.map(([k, v]) => (
        <div key={k} className="field">
          <dt>{k}</dt>
          <dd>
            {typeof v === "string" ? v : <code>{JSON.stringify(v)}</code>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
