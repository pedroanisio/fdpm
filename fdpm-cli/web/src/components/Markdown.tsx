import { useMemo } from "react";
import { marked } from "marked";

interface Props {
  source: string;
}

/**
 * Strip a leading YAML frontmatter block (`--- ... ---`) from the
 * beginning of a Markdown document. The plugin READMEs use this for
 * disclaimer metadata; rendering it as a code block would be noise.
 */
function stripFrontmatter(src: string): string {
  if (!src.startsWith("---\n") && !src.startsWith("---\r\n")) return src;
  const end = src.indexOf("\n---", 4);
  if (end === -1) return src;
  // Skip past `\n---` plus the trailing newline.
  const after = src.indexOf("\n", end + 4);
  return after === -1 ? "" : src.slice(after + 1);
}

/**
 * Demote ATX headings (`#`, `##`, …) by two levels so a plugin README's
 * top-level `#` doesn't compete with the page's own h2/h3. Caps at h6.
 * Skips fenced code blocks so we don't mangle hashes inside snippets.
 */
function demoteHeadings(src: string): string {
  const out: string[] = [];
  let inFence = false;
  let fenceMarker = "";
  for (const line of src.split("\n")) {
    const fence = line.match(/^(\s*)(```+|~~~+)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[2];
      } else if (line.includes(fenceMarker)) {
        inFence = false;
      }
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})(\s+.*)$/);
    if (heading) {
      const newDepth = Math.min(heading[1].length + 2, 6);
      out.push("#".repeat(newDepth) + heading[2]);
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

marked.use({ gfm: true, breaks: false });

export function Markdown({ source }: Props) {
  const html = useMemo(() => {
    const prepared = demoteHeadings(stripFrontmatter(source));
    return marked.parse(prepared, { async: false }) as string;
  }, [source]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
