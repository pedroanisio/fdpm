/**
 * KaTeX-backed math rendering.
 *
 * Two components:
 *   - <MathBlock expression="..." />  — display mode (centred, larger)
 *   - <MathInline expression="..." /> — inline mode (e.g. mid-sentence)
 *
 * Both call `katex.renderToString` and inject the result via
 * `dangerouslySetInnerHTML`. KaTeX's output is a self-contained,
 * sanitised HTML string by design — it does not allow arbitrary tags,
 * scripts, or event handlers in the input it processes (see
 * https://katex.org/docs/security.html). We additionally pass
 * `trust: false` (the default) and `strict: "warn"` so unknown commands
 * fall back to error rendering rather than silently dropping content.
 *
 * Parse failures are caught and surfaced inline as a small red badge
 * showing the original source — better than crashing the surrounding
 * card. KaTeX's own `errorColor` is also wired so the half-rendered
 * portions of mostly-valid expressions are visually marked.
 */
import { useMemo } from "react";
import katex from "katex";

interface Props {
  expression: string;
  /** When true, render in display mode (centred block). */
  display?: boolean;
  /** Optional className appended to the wrapper. */
  className?: string;
}

interface RenderResult {
  html: string;
  error: Error | null;
}

function renderKatex(expression: string, display: boolean): RenderResult {
  try {
    const html = katex.renderToString(expression, {
      displayMode: display,
      throwOnError: true,
      strict: "warn",
      trust: false,
      output: "html",
      errorColor: "#ff7a8a",
    });
    return { html, error: null };
  } catch (err) {
    return {
      html: "",
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

function ErrorFallback({
  expression,
  error,
  display,
}: {
  expression: string;
  error: Error;
  display: boolean;
}) {
  const Tag = display ? "div" : "span";
  return (
    <Tag className="math-error" title={error.message}>
      <span className="math-error-badge">math error</span>
      <code className="math-error-source">{expression}</code>
    </Tag>
  );
}

export function MathBlock({ expression, className }: Props) {
  const { html, error } = useMemo(() => renderKatex(expression, true), [expression]);
  if (error) {
    return <ErrorFallback expression={expression} error={error} display={true} />;
  }
  return (
    <div
      className={`math-block${className ? ` ${className}` : ""}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathInline({ expression, className }: Props) {
  const { html, error } = useMemo(() => renderKatex(expression, false), [expression]);
  if (error) {
    return <ErrorFallback expression={expression} error={error} display={false} />;
  }
  return (
    <span
      className={`math-inline${className ? ` ${className}` : ""}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
