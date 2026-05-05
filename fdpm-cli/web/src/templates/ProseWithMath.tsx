/**
 * Render a string of prose, splitting out inline LaTeX delimited by
 * `$...$` and display LaTeX delimited by `$$...$$`. Each match is
 * rendered through KaTeX; the surrounding text is rendered as plain
 * text.
 *
 * Conservative parser:
 *   - `$$ ... $$` matched first (greedy across newlines), rendered as
 *     a display block.
 *   - `$ ... $` matched second, single-line only (no `\n` inside),
 *     rendered inline.
 *   - Unclosed dollars are treated as plain text — `$5 each` stays as
 *     `$5 each`. Authors who want a literal dollar can write `\$`,
 *     which the parser preserves verbatim and KaTeX never sees.
 *   - Backslash-escaped delimiters (`\$`, `\\$`) are not split on. The
 *     parser handles the common case (`\$`); other escape patterns
 *     are out of scope.
 *
 * Newlines outside math are preserved as `<br>` so multi-line prose
 * fields render with their original line breaks.
 */
import { Fragment, type ReactNode } from "react";
import { MathBlock, MathInline } from "./Math";

type Segment =
  | { kind: "text"; value: string }
  | { kind: "inline"; value: string }
  | { kind: "block"; value: string };

/**
 * Tokenise the input into a flat list of segments. The order
 * `$$...$$` then `$...$` matters: a `$$` opener must not be claimed
 * by the inline-math pass.
 */
function tokenise(src: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  const n = src.length;

  const pushText = (s: string) => {
    if (s.length === 0) return;
    if (out.length > 0 && out[out.length - 1]!.kind === "text") {
      (out[out.length - 1] as { kind: "text"; value: string }).value += s;
    } else {
      out.push({ kind: "text", value: s });
    }
  };

  while (i < n) {
    const ch = src[i]!;

    // Backslash-escaped dollar: keep as literal $, do not open math.
    if (ch === "\\" && src[i + 1] === "$") {
      pushText("$");
      i += 2;
      continue;
    }

    // Display math: $$ ... $$, may span newlines, lazy-matched.
    if (ch === "$" && src[i + 1] === "$") {
      const close = src.indexOf("$$", i + 2);
      if (close !== -1) {
        const expr = src.slice(i + 2, close).trim();
        if (expr.length > 0) {
          out.push({ kind: "block", value: expr });
          i = close + 2;
          continue;
        }
      }
      // No close found or empty body — fall through to plain text.
    }

    // Inline math: $ ... $, no newline inside, no trailing whitespace
    // before the closing $.
    if (ch === "$") {
      // Find a closing $ on the same line, not preceded by backslash.
      let j = i + 1;
      while (j < n && src[j] !== "\n" && src[j] !== "$") {
        if (src[j] === "\\" && src[j + 1] === "$") {
          j += 2;
          continue;
        }
        j++;
      }
      if (j < n && src[j] === "$" && j > i + 1) {
        const body = src.slice(i + 1, j);
        // Reject empty / whitespace-only or trailing-space bodies — those
        // are almost always typos, not math.
        if (body.trim().length > 0) {
          out.push({ kind: "inline", value: body });
          i = j + 1;
          continue;
        }
      }
      // No close on this line, or empty body — treat as literal.
    }

    pushText(ch);
    i++;
  }

  return out;
}

/**
 * Render a text segment, preserving newlines as <br>.
 */
function renderText(text: string, keyPrefix: string): ReactNode {
  if (text.length === 0) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={`${keyPrefix}-l${i}`}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}

interface Props {
  text: string;
  /** Optional className applied to the wrapper. Default: none (Fragment). */
  className?: string;
  /**
   * Wrapper tag. Default `Fragment`. Pass `"p"` or `"span"` for
   * prose-block / inline-prose contexts where you need a real DOM
   * node for styling.
   */
  as?: "p" | "span" | "div";
}

export function ProseWithMath({ text, className, as }: Props) {
  if (!text) return null;
  const segments = tokenise(text);

  const children = segments.map((seg, i) => {
    switch (seg.kind) {
      case "text":
        return <Fragment key={i}>{renderText(seg.value, `t${i}`)}</Fragment>;
      case "inline":
        return <MathInline key={i} expression={seg.value} />;
      case "block":
        return <MathBlock key={i} expression={seg.value} />;
    }
  });

  if (as === undefined) {
    return <>{children}</>;
  }
  const Tag = as;
  return className ? <Tag className={className}>{children}</Tag> : <Tag>{children}</Tag>;
}
