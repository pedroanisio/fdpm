import type { ReactNode } from "react";

interface ErrorStateProps {
  title: string;
  error: string;
  onRetry: () => void;
  context?: ReactNode;
}

export function ErrorState({ title, error, onRetry, context }: ErrorStateProps) {
  return (
    <section className="async-state async-state-error" role="alert" aria-labelledby="async-error-title">
      {context}
      <div className="async-state-icon" aria-hidden="true">!</div>
      <div className="async-state-copy">
        <h1 id="async-error-title">{title}</h1>
        <p>{error}</p>
        <button type="button" className="button button-primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </section>
  );
}

interface EmptyStateProps {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="async-state async-state-empty">
      <div className="async-state-icon" aria-hidden="true">◇</div>
      <div className="async-state-copy">
        <h2>{title}</h2>
        <p>{description}</p>
        {action}
      </div>
    </section>
  );
}

export function DetailSkeleton({ label }: { label: string }) {
  return (
    <section className="detail-skeleton" aria-busy="true" aria-label={`Loading ${label}`}>
      <div className="skeleton-line detail-skeleton-back" />
      <div className="skeleton-line detail-skeleton-title" />
      <div className="skeleton-line detail-skeleton-meta" />
      <div className="skeleton-line detail-skeleton-lede" />
      <div className="detail-skeleton-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="skeleton-card" key={index} aria-hidden="true">
            <div className="skeleton-line skeleton-line-title" />
            <div className="skeleton-line skeleton-line-meta" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function RouteSkeleton() {
  return (
    <div className="route-skeleton" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>Loading view…</span>
    </div>
  );
}
