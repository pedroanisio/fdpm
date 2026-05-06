import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BridgeError, zodSchemaToPrimitiveType } from "../src/index.js";

const opts = { profileId: "profile:test:0.1", vendor: "test" } as const;

describe("zodSchemaToPrimitiveType — supported constructs", () => {
  it("z.object with scalar fields", () => {
    const Customer = z.object({
      id: z.string(),
      age: z.number(),
      active: z.boolean(),
    });
    const r = zodSchemaToPrimitiveType("Customer", Customer, opts);
    expect(r.primitive.id).toBe("test:Customer");
    expect(r.primitive.fields.map((f) => f.name)).toEqual(["id", "age", "active"]);
    expect(r.primitive.fields.map((f) => f.kind)).toEqual(["string", "number", "boolean"]);
    expect(r.primitive.fields.every((f) => f.required)).toBe(true);
  });

  it(".optional() yields required:false", () => {
    const S = z.object({ note: z.string().optional() });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    expect(r.primitive.fields[0]!.required).toBe(false);
  });

  it(".nullable() yields nullable:true", () => {
    const S = z.object({ note: z.string().nullable() });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    expect(r.primitive.fields[0]!.nullable).toBe(true);
  });

  it("z.enum emits an EnumDef and an enum field", () => {
    const S = z.object({ tier: z.enum(["a", "b"]) });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    expect(r.enums).toHaveLength(1);
    expect(r.enums[0]!.values).toEqual(["a", "b"]);
    expect(r.primitive.fields[0]!.kind).toBe("enum");
    expect(r.primitive.fields[0]!.enum_values).toEqual(["a", "b"]);
  });

  it("z.array emits a list field with item_field", () => {
    const S = z.object({ tags: z.array(z.string()).max(8) });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    const f = r.primitive.fields[0]!;
    expect(f.kind).toBe("list");
    expect(f.item_field?.kind).toBe("string");
    expect(f.validations).toContainEqual({ kind: "max_items", value: 8, level: "error" });
  });

  it("nested z.object is inlined as a struct field by default", () => {
    const Address = z.object({ city: z.string() });
    const S = z.object({ address: Address });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    expect(r.primitive.fields[0]!.kind).toBe("struct");
    expect(r.primitive.inline_structs).toHaveLength(1);
  });

  it("z.literal becomes a string-kind field with literal CEL constraint", () => {
    const S = z.object({ kind: z.literal("greeting") });
    const r = zodSchemaToPrimitiveType("S", S, opts);
    expect(r.primitive.fields[0]!.kind).toBe("string");
    expect(r.constraints.some((c) => c.expression.includes('== "greeting"'))).toBe(true);
  });

  it("vendor namespacing is applied to primitive type id", () => {
    const S = z.object({ a: z.string() });
    const r = zodSchemaToPrimitiveType("Foo", S, { ...opts, vendor: "acme" });
    expect(r.primitive.id).toBe("acme:Foo");
  });
});

describe("zodSchemaToPrimitiveType — feature-flagged rejections", () => {
  it("rejects z.function with flag:zod-function-promise", () => {
    const S = z.object({ fn: z.function() as unknown as z.ZodType });
    expect(() => zodSchemaToPrimitiveType("S", S, opts)).toThrow(BridgeError);
    try {
      zodSchemaToPrimitiveType("S", S, opts);
    } catch (e) {
      expect((e as BridgeError).flag).toBe("flag:zod-function-promise");
    }
  });

  it("rejects z.promise with flag:zod-function-promise", () => {
    const S = z.object({ fut: z.promise(z.string()) });
    expect(() => zodSchemaToPrimitiveType("S", S, opts)).toThrow(BridgeError);
  });

  it("rejects recursion beyond depth bound with flag:zod-recursive-lazy", () => {
    type Tree = { name: string; children: Tree[] };
    const Tree: z.ZodType<Tree> = z.lazy(() =>
      z.object({ name: z.string(), children: z.array(Tree) }),
    );
    const S = z.object({ root: Tree });
    expect(() => zodSchemaToPrimitiveType("S", S, { ...opts, recursionDepth: 0 })).toThrow();
  });
});
