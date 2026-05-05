/**
 * REPL internals — pure-function unit tests.
 *
 * Covers tokenizer, comment-stripper, and the metadata
 * longest-prefix lookup. These are the SPEC-REPL §8.4 + §10.2
 * primitives the dispatcher composes; testing them in isolation
 * means the integration suite can focus on observable end-to-end
 * behavior instead of probing internals.
 */
import { describe, expect, it } from "vitest";
import { _internal } from "../../src/commands/repl.js";
import { type CommandMetadataMap, NO_PROJECT_ARGV, NO_PROJECT_JSON } from "../../src/commands/metadata.js";

const { tokenizeLine, stripComment, lookupMetadata } = _internal;

describe("REPL tokenizer (SPEC-REPL §8.4)", () => {
  it("splits on whitespace", () => {
    expect(tokenizeLine("primitive list my-proj")).toEqual(["primitive", "list", "my-proj"]);
  });

  it("respects single quotes", () => {
    expect(tokenizeLine("primitive create my-proj --field 'a b c'")).toEqual([
      "primitive",
      "create",
      "my-proj",
      "--field",
      "a b c",
    ]);
  });

  it("respects double quotes", () => {
    expect(tokenizeLine('primitive create my-proj --field "a b c"')).toEqual([
      "primitive",
      "create",
      "my-proj",
      "--field",
      "a b c",
    ]);
  });

  it("respects backslash escape", () => {
    expect(tokenizeLine("project create --name foo\\ bar")).toEqual([
      "project",
      "create",
      "--name",
      "foo bar",
    ]);
  });

  it("rejects shell pipes (no eval / pipeline allowed)", () => {
    expect(() => tokenizeLine("primitive list my-proj | head")).toThrow(/unsupported shell token/);
  });

  it("rejects shell redirection", () => {
    expect(() => tokenizeLine("primitive list my-proj > out.txt")).toThrow(
      /unsupported shell token/,
    );
  });
});

describe("REPL comment stripping", () => {
  it("preserves a leading-hash line as comment", () => {
    expect(stripComment("# entire line")).toBe("");
  });

  it("strips trailing whitespace-prefixed comments (including the leading whitespace)", () => {
    // Note: my-proj has no trailing space — the regex `(^|\s)#` matches
    // the whitespace + hash and clips both, so the returned string
    // ends right after the project id token.
    expect(stripComment("primitive list my-proj # a note")).toBe("primitive list my-proj");
  });

  it("preserves hash characters embedded inside tokens", () => {
    // Don't clip `--id rel:bar#baz` — that's a legitimate primitive id.
    expect(stripComment("relation get my-proj rel:bar#baz")).toBe(
      "relation get my-proj rel:bar#baz",
    );
  });

  it("returns the line unchanged when no comment", () => {
    expect(stripComment("validate my-proj")).toBe("validate my-proj");
  });
});

describe("REPL metadata longest-prefix lookup", () => {
  const fixture: CommandMetadataMap = {
    primitive: {
      readOnly: true,
      projectIdsFromArgv: NO_PROJECT_ARGV,
      projectIdsFromJson: NO_PROJECT_JSON,
    },
    "primitive create": {
      readOnly: false,
      projectIdsFromArgv: NO_PROJECT_ARGV,
      projectIdsFromJson: NO_PROJECT_JSON,
    },
    validate: {
      readOnly: true,
      projectIdsFromArgv: NO_PROJECT_ARGV,
      projectIdsFromJson: NO_PROJECT_JSON,
    },
  };

  it("matches the longest prefix when both depths exist", () => {
    const meta = lookupMetadata(["primitive", "create", "my-proj"], fixture);
    expect(meta?.readOnly).toBe(false);
  });

  it("falls back to the depth-1 entry when the longer key is absent", () => {
    const meta = lookupMetadata(["primitive", "list", "my-proj"], fixture);
    expect(meta?.readOnly).toBe(true);
  });

  it("matches a depth-1 command (no subcommand)", () => {
    const meta = lookupMetadata(["validate", "my-proj"], fixture);
    expect(meta?.readOnly).toBe(true);
  });

  it("returns undefined when no entry matches", () => {
    expect(lookupMetadata(["nonexistent"], fixture)).toBeUndefined();
  });

  it("returns undefined for an empty token list", () => {
    expect(lookupMetadata([], fixture)).toBeUndefined();
  });
});
