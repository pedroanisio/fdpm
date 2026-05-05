import { useEffect, useState } from "react";
import { api } from "../api";
import type { ProfileDetail, WorkbookSummary } from "../types";

interface Props {
  id: string;
}

interface Bundle {
  profile: ProfileDetail;
  workbooks: WorkbookSummary[];
}

function asTypeList(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function ProfileDetailPage({ id }: Props) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBundle(null);
    setError(null);
    Promise.all([api.getProfile(id), api.listWorkbooks()])
      .then(([profile, wbs]) => setBundle({ profile, workbooks: wbs.workbooks }))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="error">
        <a href="#/plugins" className="back">← Plugins</a>
        <strong>Failed to load profile {id}:</strong> {error}
      </div>
    );
  }
  if (!bundle) return <div className="loading">Loading {id}…</div>;
  const { profile, workbooks } = bundle;
  const using = workbooks.filter((w) => w.profile_id === profile.id);

  return (
    <article className="profile-detail">
      <a href="#/plugins" className="back">← Plugins</a>
      <header className="profile-hero">
        <h2>{profile.label}</h2>
        <div className="profile-hero-meta">
          <code>{profile.id}</code>
          <span className="sep">·</span>
          <span>v{profile.version}</span>
          <span className="sep">·</span>
          <span>{profile.primitive_types.length} primitive types</span>
          <span className="sep">·</span>
          <span>{profile.relation_types.length} relation types</span>
        </div>
        {profile.description && <p className="profile-hero-description">{profile.description}</p>}
        {profile.extends && profile.extends.length > 0 && (
          <div className="profile-hero-extends">
            Extends:{" "}
            {profile.extends.map((ext, i) => (
              <span key={ext}>
                <a href={`#/profile/${encodeURIComponent(ext)}`}><code>{ext}</code></a>
                {i < profile.extends!.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        )}
      </header>

      <section className="plugin-section">
        <h3>Workbooks using this profile <span className="count">({using.length})</span></h3>
        {using.length === 0 ? (
          <p className="page-lede">None in this store yet.</p>
        ) : (
          <ul className="profile-using-list">
            {using.map((w) => (
              <li key={w.id}>
                <a href={`#/wb/${encodeURIComponent(w.id)}`}>
                  <strong>{w.name}</strong>
                </a>
                <span className="profile-using-meta">
                  <code>{w.id}</code> · rev {w.revision}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="plugin-section">
        <h3>Primitive types <span className="count">({profile.primitive_types.length})</span></h3>
        {profile.primitive_types.length === 0 ? (
          <p className="page-lede">This profile registers no primitive types directly.</p>
        ) : (
          <div className="type-cards">
            {profile.primitive_types.map((t) => (
              <article key={t.id} className="type-card">
                <header>
                  <div className="type-card-name">{t.name}</div>
                  <div className="type-card-id"><code>{t.id}</code></div>
                </header>
                {t.description && <p className="type-card-description">{t.description}</p>}
                {t.id_format && (
                  <div className="type-card-idformat">
                    <span className="type-card-label">id_format</span>
                    <code>{t.id_format.pattern}</code>
                    <span className="dim"> ({t.id_format.pattern_kind}, {t.id_format.uniqueness})</span>
                  </div>
                )}
                {t.fields.length > 0 && (
                  <div className="type-card-fields">
                    <span className="type-card-label">fields</span>
                    <ul>
                      {t.fields.map((f) => (
                        <li key={f.name}>
                          <code>{f.name}</code>
                          <span className="dim">: {f.kind}</span>
                          {f.required && <span className="required-tag">required</span>}
                          {f.description && <div className="field-description">{f.description}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="plugin-section">
        <h3>Relation types <span className="count">({profile.relation_types.length})</span></h3>
        {profile.relation_types.length === 0 ? (
          <p className="page-lede">This profile registers no relation types directly.</p>
        ) : (
          <div className="type-cards">
            {profile.relation_types.map((t) => (
              <article key={t.id} className="type-card">
                <header>
                  <div className="type-card-name">{t.name ?? t.id}</div>
                  <div className="type-card-id"><code>{t.id}</code></div>
                </header>
                {t.description && <p className="type-card-description">{t.description}</p>}
                <div className="type-card-endpoints">
                  <div>
                    <span className="type-card-label">source</span>
                    {asTypeList(t.source_types).map((s) => <code key={s}>{s}</code>)}
                  </div>
                  <div>
                    <span className="type-card-label">target</span>
                    {asTypeList(t.target_types).map((s) => <code key={s}>{s}</code>)}
                  </div>
                </div>
                {t.fields && t.fields.length > 0 && (
                  <div className="type-card-fields">
                    <span className="type-card-label">fields</span>
                    <ul>
                      {t.fields.map((f) => (
                        <li key={f.name}>
                          <code>{f.name}</code>
                          <span className="dim">: {f.kind}</span>
                          {f.required && <span className="required-tag">required</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
