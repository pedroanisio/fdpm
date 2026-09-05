/**
 * `{{variable}}` rendering for lf:PromptTemplate messages.
 *
 * Strict in both directions: a placeholder with no binding is an error, and a
 * binding no placeholder uses is an error. A template that silently renders
 * "{{step}}" as literal text, or silently drops the step it was handed, is a
 * stage whose prompt does not say what its records say it says.
 */

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function templateVariables(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) names.add(m[1]!);
  return [...names];
}

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly missing: string[],
    readonly unused: string[],
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

function serialize(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 0);
}

export interface RenderOptions {
  /**
   * Bindings a stage driver consumes rather than the prompt (a repository
   * path, a mode) legitimately appear in no placeholder. Name them here; any
   * other unused binding is still an error.
   */
  driverConsumed?: readonly string[];
}

/**
 * Render `text` with `bindings`. Non-string values are serialised as compact
 * JSON, which is how a stage output becomes the next stage's `{{step}}`.
 */
export function renderTemplate(text: string, bindings: Readonly<Record<string, unknown>>, opts: RenderOptions = {}): string {
  const wanted = templateVariables(text);
  const consumed = new Set(opts.driverConsumed ?? []);
  const missing = wanted.filter((name) => !Object.prototype.hasOwnProperty.call(bindings, name));
  const unused = Object.keys(bindings).filter((name) => !wanted.includes(name) && !consumed.has(name));
  if (missing.length > 0 || unused.length > 0) {
    throw new TemplateError(
      `template/binding mismatch: missing ${JSON.stringify(missing)}, unused ${JSON.stringify(unused)}`,
      missing,
      unused,
    );
  }
  return text.replace(PLACEHOLDER, (_m, name: string) => serialize(bindings[name]));
}
