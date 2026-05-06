/**
 * Regression tests for the six bugs surfaced by the
 * pitch-deck trial (workbook trial-zod-bridge-pitch-deck §2). Each
 * test is a minimal reproducer for the original failure, run
 * post-fix to lock in the corrected behavior.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BridgeError, zodSchemaToPrimitiveType } from "../src/index.js";

const opts = { profileId: "profile:test:0.1", vendor: "test" } as const;

describe("regression: deeply nested objects do not trip flag:zod-recursive-lazy (was: failure:trial:recursion-conflation)", () => {
  it("three-level object nesting succeeds with default recursionDepth", () => {
    const Inner = z.object({ leaf: z.string() });
    const Mid = z.object({ inner: Inner });
    const Outer = z.object({ mid: Mid });
    expect(() => zodSchemaToPrimitiveType("Outer", Outer, opts)).not.toThrow();
  });

  it("five-level nesting still succeeds", () => {
    const A = z.object({ x: z.string() });
    const B = z.object({ a: A });
    const C = z.object({ b: B });
    const D = z.object({ c: C });
    const E = z.object({ d: D });
    expect(() => zodSchemaToPrimitiveType("Root", E, opts)).not.toThrow();
  });

  it("real z.lazy still bounded by recursionDepth", () => {
    type Tree = { name: string; children: Tree[] };
    const Tree: z.ZodType<Tree> = z.lazy(() =>
      z.object({ name: z.string(), children: z.array(Tree) }),
    );
    const Root = z.object({ root: Tree });
    expect(() =>
      zodSchemaToPrimitiveType("Root", Root, { ...opts, recursionDepth: 0 }),
    ).toThrow();
  });
});

describe("regression: typePath does not compound (was: failure:trial:struct-name-compounding)", () => {
  it("nested struct ids stay linear in depth", () => {
    const Palette = z.object({ bg: z.string() });
    const Design = z.object({ palette: Palette });
    const Root = z.object({ design: Design });
    const r = zodSchemaToPrimitiveType("Root", Root, opts);
    const ids = r.primitive.inline_structs?.map((s) => s.id) ?? [];
    // Names are RootDesign and RootDesignPalette, NOT
    // RootRootDesignPalette or any quadratic permutation.
    for (const id of ids) {
      const segments = id.match(/Root/g) ?? [];
      expect(segments.length).toBeLessThanOrEqual(1);
    }
    expect(ids).toContain("RootDesign");
    expect(ids).toContain("RootDesignPalette");
  });
});

describe("regression: .transform()/.pipe() unwrapped, not rejected (was: failure:trial:pipe-hard-reject)", () => {
  it("z.string().transform() is accepted as string", () => {
    const Hex = z.string().regex(/^#?[0-9a-f]{6}$/).transform((s) => s.toLowerCase());
    const S = z.object({ color: Hex });
    expect(() => zodSchemaToPrimitiveType("S", S, opts)).not.toThrow();
    const r = zodSchemaToPrimitiveType("S", S, opts);
    expect(r.primitive.fields[0]!.kind).toBe("string");
  });

  it("z.function still hard-rejected with flag:zod-function-promise", () => {
    const S = z.object({ fn: z.function() as unknown as z.ZodType });
    let caught: BridgeError | undefined;
    try {
      zodSchemaToPrimitiveType("S", S, opts);
    } catch (e) {
      caught = e as BridgeError;
    }
    expect(caught?.flag).toBe("flag:zod-function-promise");
  });

  it("z.promise still hard-rejected", () => {
    const S = z.object({ p: z.promise(z.string()) });
    expect(() => zodSchemaToPrimitiveType("S", S, opts)).toThrow();
  });
});

describe("regression: z.union and z.discriminatedUnion fall back to payload-blob (was: failure:trial:union-field-level-reject)", () => {
  it("z.union(string, number) emits string + format=json-union", () => {
    const S = z.object({ value: z.union([z.string(), z.number()]) });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    const f = r.primitive.fields[0]!;
    expect(f.kind).toBe("string");
    expect(f.format).toBe("json-union");
  });

  it("z.discriminatedUnion emits string + format=json-union", () => {
    const Variant = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a"), x: z.string() }),
      z.object({ kind: z.literal("b"), y: z.number() }),
    ]);
    const S = z.object({ ask: Variant });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    expect(r.primitive.fields[0]!.kind).toBe("string");
    expect(r.primitive.fields[0]!.format).toBe("json-union");
  });
});

describe("regression: z.record falls back to payload-blob (was: failure:trial:record-no-mapping)", () => {
  it("z.record(SlugId, HexColor) emits string + format=json-record", () => {
    const S = z.object({
      brandColors: z.record(z.string(), z.string()),
    });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    expect(r.primitive.fields[0]!.kind).toBe("string");
    expect(r.primitive.fields[0]!.format).toBe("json-record");
  });
});

describe("regression: array-element struct ids are unique per parent field (was: failure:trial:item-struct-collision)", () => {
  it("two same-parent arrays produce distinct struct ids", () => {
    const A = z.object({ ax: z.string() });
    const B = z.object({ bx: z.string() });
    const Root = z.object({
      audiences: z.array(A),
      sources: z.array(B),
    });
    const r = zodSchemaToPrimitiveType("Root", Root, opts);
    const ids = r.primitive.inline_structs?.map((s) => s.id) ?? [];
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    expect(ids).toContain("RootAudiencesItem");
    expect(ids).toContain("RootSourcesItem");
  });

  it("nested arrays of the same shape still produce unique ids", () => {
    const Inner = z.object({ leaf: z.string() });
    const Wrapper = z.object({
      list1: z.array(Inner),
      list2: z.array(Inner),
    });
    const r = zodSchemaToPrimitiveType("Wrapper", Wrapper, opts);
    const ids = r.primitive.inline_structs?.map((s) => s.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
