type SkeletonListProps = {
  count: number;
  variant: "workbook" | "plugin";
};

export function SkeletonList({ count, variant }: SkeletonListProps) {
  const className = variant === "workbook" ? "workbook-list" : "plugin-list";
  return (
    <ul className={className} aria-busy="true" aria-label="Loading…">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="skeleton-card" aria-hidden="true">
          <div className="skeleton-line skeleton-line-title" />
          <div className="skeleton-line skeleton-line-meta" />
        </li>
      ))}
    </ul>
  );
}
