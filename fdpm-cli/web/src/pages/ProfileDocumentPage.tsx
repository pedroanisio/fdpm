import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { ProfileDetail } from "../types";
import { ProfileDocument } from "../print/ProfileDocument";
import { buildProfileDocumentModel, documentTitle } from "../print/profileDocument";

interface Props {
  id: string;
}

/**
 * Full-page, print-ready profile-reference document with a (screen-only)
 * toolbar to return or export as PDF.
 *
 * "Export as PDF" uses the browser's own print engine (`window.print()`)
 * against a print stylesheet (`@media print` in styles.css). This yields a
 * genuinely polished, full-CSS PDF with zero additional dependencies and no
 * headless-browser toolchain — the viewer's browser is the renderer.
 */
export function ProfileDocumentPage({ id }: Props) {
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(null);
    setError(null);
    api
      .getProfile(id)
      .then(setProfile)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  // Set the document title while this page is mounted so the browser's
  // "Save as PDF" dialog suggests a meaningful filename; restore on unmount.
  useEffect(() => {
    if (!profile) return;
    const previous = document.title;
    document.title = documentTitle(profile);
    return () => {
      document.title = previous;
    };
  }, [profile]);

  const model = useMemo(
    () => (profile ? buildProfileDocumentModel(profile, new Date()) : null),
    [profile],
  );

  if (error) {
    return (
      <div className="error">
        <a href={`#/profile/${encodeURIComponent(id)}`} className="back">
          ← Profile
        </a>
        <strong>Failed to load profile {id}:</strong> {error}
      </div>
    );
  }
  if (!model) return <div className="loading">Loading {id}…</div>;

  return (
    <div className="doc-page">
      <div className="doc-toolbar no-print" role="toolbar" aria-label="Document actions">
        <a href={`#/profile/${encodeURIComponent(id)}`} className="back">
          ← Back to profile
        </a>
        <div className="doc-toolbar-actions">
          <span className="doc-toolbar-hint">
            Tip: choose “Save as PDF” as the destination in the print dialog.
          </span>
          <button type="button" className="doc-export-btn" onClick={() => window.print()}>
            Export as PDF
          </button>
        </div>
      </div>
      <ProfileDocument model={model} />
    </div>
  );
}
