/**
 * A text syntax for the expression language, and its parser — the inverse
 * of `renderers/_formula.ts`.
 *
 * WHY. Every formula an agent writes into this profile is a nested JSON
 * tree in the vendored schema's shape. That is the right storage form and
 * the wrong authoring form: `{"kind":"predicate_application_formula",
 * "predicate":{"kind":"reference","targetId":"pred:Human",...},"arguments":
 * [{"kind":"variable_term","name":"x"}]}` is `Human(x)`. This module turns
 * `∀x. Human(x) ⇒ Mortal(x)` into that tree, so a caller (the SDK, a fixture,
 * an importer of a text format) can author in notation and store the tree.
 * The printer already produces the same notation, and `formula.test.ts`
 * holds parse ∘ print ∘ parse fixed.
 *
 * SYNTAX (precedence low → high): `↔`/`<->` · `⇒`/`=>` (logical) and
 * `→`/`->` (material), right-associative · `∨`/`|`/`or` · `⊕`/`xor` ·
 * `∧`/`&`/`and` · `¬`/`!`/`not` and the quantifiers `∀ x, y.` / `forall`,
 * `∃`/`exists` · atoms. Atoms: `⊤`/`true`, `⊥`/`false`, `p` (a proposition
 * reference), `P(t, …)` (a predicate application), and comparisons
 * `t = u`, `t ≠ u` / `!=`, `<`, `<=`/`≤`, `>`, `>=`/`≥`, `t ∈ u` / `in`.
 * Terms: identifiers bound by an enclosing quantifier (or passed in
 * `variables`) are variables, every other identifier is a `constant_term`
 * reference to a declared symbol, `f(t, …)` is a function application,
 * numbers are integer/decimal literals, `"…"` is a string literal,
 * `[a, b]` a list, and `+ - * /` build arithmetic expressions. Identifiers
 * may contain `:`, `.`, `/`, `#` and `-` after the first character, so the
 * schema's own ids (`pred:Human`, `const:socrates`) are written as they are.
 *
 * WHAT IT IS NOT. A theorem prover, or a complete surface for the 59 formula
 * kinds: modal, deontic, temporal, probabilistic and description-logic
 * operators have no textual form here and are written as JSON. Every
 * parse failure is a typed result with a position, never a throw.
 */

type Json = Record<string, unknown>;

export interface ParseOptions {
  /** Identifiers to treat as variables even outside a quantifier. */
  variables?: Iterable<string>;
}

export type ParseResult =
  | { ok: true; formula: Json }
  | { ok: false; error: string; position: number };

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_.:/#-]/;

type Tok =
  | { t: "ident"; v: string; pos: number }
  | { t: "number"; v: string; pos: number }
  | { t: "string"; v: string; pos: number }
  | { t: "op"; v: string; pos: number }
  | { t: "eof"; v: ""; pos: number };

const MULTI_OPS = ["<->", "<=", ">=", "!=", "->", "=>"];
const SINGLE_OPS = "()[],.=<>+-*/|&!";
const UNICODE_OPS: Record<string, string> = {
  "¬": "!", "∧": "&", "∨": "|", "⊕": "xor", "⇒": "=>", "→": "->", "↔": "<->",
  "∀": "forall", "∃": "exists", "≠": "!=", "≤": "<=", "≥": ">=", "∈": "in", "⊤": "true", "⊥": "false", "·": "*", "×": "*", "÷": "/", "−": "-",
};
const WORD_OPS = new Set(["and", "or", "xor", "not", "forall", "exists", "in", "true", "false"]);

class Lexer {
  private i = 0;
  readonly tokens: Tok[] = [];
  constructor(private readonly src: string) {}

  run(): Tok[] | { error: string; position: number } {
    const s = this.src;
    while (this.i < s.length) {
      const c = s[this.i]!;
      if (/\s/.test(c)) {
        this.i += 1;
        continue;
      }
      const uni = UNICODE_OPS[c];
      if (uni !== undefined) {
        this.tokens.push({ t: WORD_OPS.has(uni) ? "ident" : "op", v: uni, pos: this.i });
        this.i += 1;
        continue;
      }
      const multi = MULTI_OPS.find((m) => s.startsWith(m, this.i));
      if (multi) {
        this.tokens.push({ t: "op", v: multi, pos: this.i });
        this.i += multi.length;
        continue;
      }
      if (SINGLE_OPS.includes(c)) {
        this.tokens.push({ t: "op", v: c, pos: this.i });
        this.i += 1;
        continue;
      }
      if (/[0-9]/.test(c)) {
        const start = this.i;
        while (this.i < s.length && /[0-9]/.test(s[this.i]!)) this.i += 1;
        if (s[this.i] === "." && /[0-9]/.test(s[this.i + 1] ?? "")) {
          this.i += 1;
          while (this.i < s.length && /[0-9]/.test(s[this.i]!)) this.i += 1;
        }
        this.tokens.push({ t: "number", v: s.slice(start, this.i), pos: start });
        continue;
      }
      if (c === '"') {
        const start = this.i;
        let out = "";
        this.i += 1;
        for (;;) {
          if (this.i >= s.length) return { error: "unterminated string literal", position: start };
          const ch = s[this.i]!;
          if (ch === "\\") {
            const next = s[this.i + 1];
            if (next === undefined) return { error: "unterminated escape", position: this.i };
            out += next === "n" ? "\n" : next === "t" ? "\t" : next;
            this.i += 2;
            continue;
          }
          if (ch === '"') {
            this.i += 1;
            break;
          }
          out += ch;
          this.i += 1;
        }
        this.tokens.push({ t: "string", v: out, pos: start });
        continue;
      }
      if (IDENT_START.test(c)) {
        const start = this.i;
        this.i += 1;
        while (this.i < s.length && IDENT_PART.test(s[this.i]!)) this.i += 1;
        // A trailing '.' belongs to the quantifier (`∀x.`), not to the identifier.
        while (this.i > start + 1 && s[this.i - 1] === ".") this.i -= 1;
        this.tokens.push({ t: "ident", v: s.slice(start, this.i), pos: start });
        continue;
      }
      return { error: `unexpected character '${c}'`, position: this.i };
    }
    this.tokens.push({ t: "eof", v: "", pos: s.length });
    return this.tokens;
  }
}

class ParseError extends Error {
  constructor(message: string, readonly position: number) {
    super(message);
  }
}

const ref = (targetId: string): Json => ({ kind: "reference", targetId, resolution: "local" });

class Parser {
  private k = 0;
  private readonly bound: Set<string>[] = [];
  constructor(private readonly toks: Tok[], initial: Set<string>) {
    this.bound.push(initial);
  }

  private peek(): Tok {
    return this.toks[this.k]!;
  }
  private next(): Tok {
    return this.toks[this.k++]!;
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === "op" && t.v === v;
  }
  private isWord(v: string): boolean {
    const t = this.peek();
    return t.t === "ident" && t.v === v;
  }
  private expectOp(v: string): void {
    const t = this.next();
    if (t.t !== "op" || t.v !== v) throw new ParseError(`expected '${v}'`, t.pos);
  }
  private isBound(name: string): boolean {
    return this.bound.some((s) => s.has(name));
  }

  parseAll(): Json {
    const f = this.formula();
    const t = this.peek();
    if (t.t !== "eof") throw new ParseError(`unexpected '${t.v}'`, t.pos);
    return f;
  }

  formula(): Json {
    return this.iff();
  }

  private iff(): Json {
    let left = this.implication();
    while (this.isOp("<->")) {
      this.next();
      const right = this.implication();
      left = { kind: "biconditional_formula", left, right };
    }
    return left;
  }

  private implication(): Json {
    const antecedent = this.or();
    if (this.isOp("=>")) {
      this.next();
      return { kind: "logical_implication_formula", antecedent, consequent: this.implication() };
    }
    if (this.isOp("->")) {
      this.next();
      return { kind: "material_implication_formula", antecedent, consequent: this.implication() };
    }
    return antecedent;
  }

  private nary(kind: string, sub: () => Json, ...ops: string[]): Json {
    const operands = [sub()];
    while (ops.some((o) => this.isOp(o) || this.isWord(o))) {
      this.next();
      operands.push(sub());
    }
    return operands.length === 1 ? operands[0]! : { kind, operands };
  }

  private or(): Json {
    return this.nary("or_formula", () => this.xor(), "|", "or");
  }
  private xor(): Json {
    return this.nary("xor_formula", () => this.and(), "xor");
  }
  private and(): Json {
    return this.nary("and_formula", () => this.unary(), "&", "and");
  }

  private unary(): Json {
    if (this.isOp("!") || this.isWord("not")) {
      this.next();
      return { kind: "not_formula", operand: this.unary() };
    }
    if (this.isWord("forall") || this.isWord("exists")) {
      const q = this.next().v;
      const names: string[] = [];
      for (;;) {
        const t = this.next();
        if (t.t !== "ident" || WORD_OPS.has(t.v)) throw new ParseError("expected a variable name after the quantifier", t.pos);
        names.push(t.v);
        if (this.isOp(",")) {
          this.next();
          continue;
        }
        break;
      }
      this.expectOp(".");
      this.bound.push(new Set(names));
      try {
        const body = this.formula();
        return {
          kind: q === "forall" ? "forall_formula" : "exists_formula",
          variables: names.map((name) => ({ kind: "variable_binding", name })),
          body,
        };
      } finally {
        this.bound.pop();
      }
    }
    return this.atom();
  }

  private atom(): Json {
    const t = this.peek();
    if (t.t === "ident" && (t.v === "true" || t.v === "false")) {
      this.next();
      return { kind: "truth_constant_formula", value: t.v };
    }
    if (this.isOp("(")) {
      // Either a parenthesised formula or a parenthesised term at the head of a comparison.
      const save = this.k;
      this.next();
      let asFormula: ParseError | undefined;
      try {
        const inner = this.formula();
        this.expectOp(")");
        if (this.comparisonAhead()) {
          this.k = save;
          return this.comparison();
        }
        return inner;
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        asFormula = e;
      }
      // Not a parenthesised formula: try a parenthesised term heading a comparison.
      this.k = save;
      try {
        return this.comparison();
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        // Report whichever reading got further; ties go to the formula reading.
        throw e.position > asFormula.position ? e : asFormula;
      }
    }
    return this.comparison();
  }

  private comparisonAhead(): boolean {
    const t = this.peek();
    return t.t === "op" ? ["=", "!=", "<", "<=", ">", ">=", "+", "-", "*", "/"].includes(t.v) : t.t === "ident" && t.v === "in";
  }

  /** A term, or a term followed by a comparison; a bare identifier/application is a proposition/predicate. */
  private comparison(): Json {
    const startTok = this.peek();
    const left = this.term();
    const t = this.peek();
    const op = t.t === "op" ? t.v : t.t === "ident" && t.v === "in" ? "in" : undefined;
    const COMPARISONS: Record<string, string> = { "<": "lt", "<=": "lte", ">": "gt", ">=": "gte" };
    if (op === "=") {
      this.next();
      return { kind: "equality_formula", left, right: this.term() };
    }
    if (op === "!=") {
      this.next();
      return { kind: "inequality_formula", left, right: this.term() };
    }
    if (op !== undefined && op in COMPARISONS) {
      this.next();
      return { kind: "comparison_formula", operator: COMPARISONS[op]!, left, right: this.term() };
    }
    if (op === "in") {
      this.next();
      return { kind: "membership_formula", element: left, set: this.term() };
    }
    // No comparison: the term must be a predicate application or a proposition.
    if (left["kind"] === "function_application_term") {
      return { kind: "predicate_application_formula", predicate: left["function"], arguments: left["arguments"] };
    }
    if (left["kind"] === "constant_term") {
      return { kind: "proposition_reference_formula", proposition: left["symbol"] };
    }
    throw new ParseError("expected a formula (a proposition, an application or a comparison)", startTok.pos);
  }

  private term(): Json {
    return this.additive();
  }

  private additive(): Json {
    let left = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().v === "+" ? "add" : "subtract";
      left = { kind: "arithmetic_expression", operator: op, operands: [left, this.multiplicative()] };
    }
    return left;
  }

  private multiplicative(): Json {
    let left = this.primary();
    while (this.isOp("*") || this.isOp("/")) {
      const op = this.next().v === "*" ? "multiply" : "divide";
      left = { kind: "arithmetic_expression", operator: op, operands: [left, this.primary()] };
    }
    return left;
  }

  private primary(): Json {
    const t = this.next();
    if (t.t === "number") {
      return t.v.includes(".") ? { kind: "decimal_literal", value: t.v } : { kind: "integer_literal", value: t.v };
    }
    if (t.t === "string") return { kind: "string_literal", value: t.v };
    if (t.t === "op" && t.v === "-") {
      return { kind: "arithmetic_expression", operator: "negate", operands: [this.primary()] };
    }
    if (t.t === "op" && t.v === "(") {
      const inner = this.term();
      this.expectOp(")");
      return inner;
    }
    if (t.t === "op" && t.v === "[") {
      const items: Json[] = [];
      if (!this.isOp("]")) {
        for (;;) {
          items.push(this.term());
          if (this.isOp(",")) {
            this.next();
            continue;
          }
          break;
        }
      }
      this.expectOp("]");
      return { kind: "list_term", items };
    }
    if (t.t === "ident" && !WORD_OPS.has(t.v)) {
      if (this.isOp("(")) {
        this.next();
        const args: Json[] = [];
        if (!this.isOp(")")) {
          for (;;) {
            args.push(this.term());
            if (this.isOp(",")) {
              this.next();
              continue;
            }
            break;
          }
        }
        this.expectOp(")");
        return { kind: "function_application_term", function: ref(t.v), arguments: args };
      }
      return this.isBound(t.v) ? { kind: "variable_term", name: t.v } : { kind: "constant_term", symbol: ref(t.v) };
    }
    throw new ParseError(t.t === "eof" ? "unexpected end of input" : `unexpected '${t.v}'`, t.pos);
  }
}

/** Parses one formula. Never throws: syntax errors come back with a position. */
export function parseFormula(text: string, options: ParseOptions = {}): ParseResult {
  const lexed = new Lexer(text).run();
  if (!Array.isArray(lexed)) return { ok: false, error: lexed.error, position: lexed.position };
  try {
    const formula = new Parser(lexed, new Set(options.variables ?? [])).parseAll();
    return { ok: true, formula };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, position: e.position };
    return { ok: false, error: (e as Error).message, position: 0 };
  }
}

/** Parses a term on its own (a value expression), for fields typed `ValueExpression`. */
export function parseTerm(text: string, options: ParseOptions = {}): ParseResult {
  const lexed = new Lexer(text).run();
  if (!Array.isArray(lexed)) return { ok: false, error: lexed.error, position: lexed.position };
  try {
    const parser = new Parser(lexed, new Set(options.variables ?? []));
    const term = (parser as unknown as { term(): Json }).term();
    const rest = (parser as unknown as { peek(): Tok }).peek();
    if (rest.t !== "eof") return { ok: false, error: `unexpected '${rest.v}'`, position: rest.pos };
    return { ok: true, formula: term };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, position: e.position };
    return { ok: false, error: (e as Error).message, position: 0 };
  }
}
