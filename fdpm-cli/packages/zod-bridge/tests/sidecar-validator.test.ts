/**
 * Parse-time validator tests — SPEC-DOMAIN-SIDECAR §11.3 + §2.3 + §2.4.
 *
 * Every pass MUST throw a SidecarError with a stable code on the first
 * offending entry; aborting before the bridge attempts emission. No
 * partial output is the contract.
 *
 * The 8 ordered passes (§11.3):
 *   1. schema-name resolution
 *   2. path resolution
 *   3. aggregate consistency
 *   4. inverse pairing
 *   5. variant consistency
 *   6. identity consistency
 *   7. variant-local references
 *   8. DNIS field consistency
 *
 * Plus pre-pass shape gates:
 *   - sidecar:missing-version (§2.3)
 *   - sidecar:missing-entities (§2.3)
 *   - sidecar:hash-manifest-malformed (§2.4.2)
 *   - sidecar:hash-algorithm-unsupported (§2.4.3)
 *
 * Tests use minimal Zod fixtures so the validator's behavior is not
 * coupled to the rest of the bridge's schema introspection paths.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateDomain, SidecarError } from "../src/sidecar-validator.js";
import { defineDomain, type Domain } from "../src/sidecar-types.js";

// Reference-equal id schemas per SPEC-DOMAIN-SIDECAR §3.3: idSchema MUST
// be the same Zod node the entity's id-field references.
const CustomerId = z.string();
const Customer = z.object({ id: CustomerId, name: z.string() });
const OrderId = z.string();
const Order = z.object({ id: OrderId, customerId: z.string() });
const baseFdpm = {
  pluginId: "acme.x",
  vendor: "acme",
  profileId: "profile:acme-x:0.1",
  pluginVersion: "0.1.0",
  hostCompatibility: "*",
} as const;

function minimalDomain(): Domain {
  return defineDomain({
    __sidecarSpec: "0.1",
    entities: {
      Customer: {
        schema: Customer,
        identityKind: "id-field",
        idField: "id",
        idSchema: CustomerId,
      },
    },
    fdpm: baseFdpm,
  });
}

describe("validateDomain — pre-pass shape gates", () => {
  it("throws sidecar:missing-version when __sidecarSpec is absent", () => {
    const bad = { entities: {}, fdpm: baseFdpm } as unknown as Domain;
    expect(() => validateDomain(bad)).toThrow(SidecarError);
    expect(() => validateDomain(bad)).toThrow(/sidecar:missing-version/);
  });

  it("throws sidecar:missing-entities when entities is absent or empty", () => {
    const noEntities = {
      __sidecarSpec: "0.1",
      fdpm: baseFdpm,
    } as unknown as Domain;
    expect(() => validateDomain(noEntities)).toThrow(/sidecar:missing-entities/);
    const empty = defineDomain({
      __sidecarSpec: "0.1",
      entities: {},
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(empty)).toThrow(/sidecar:missing-entities/);
  });

  it("throws sidecar:hash-manifest-malformed when files is empty", () => {
    const d = minimalDomain();
    (d as { __schemaHash?: unknown }).__schemaHash = {
      algorithm: "zod-ast-canonical-v1",
      files: {},
    };
    expect(() => validateDomain(d)).toThrow(/sidecar:hash-manifest-malformed/);
  });

  it("throws sidecar:hash-manifest-malformed when algorithm missing", () => {
    const d = minimalDomain();
    (d as { __schemaHash?: unknown }).__schemaHash = {
      files: { "x.ts": "sha256:abc" },
    };
    expect(() => validateDomain(d)).toThrow(/sidecar:hash-manifest-malformed/);
  });

  it("throws sidecar:hash-algorithm-unsupported on unknown algorithm", () => {
    const d = minimalDomain();
    (d as { __schemaHash?: unknown }).__schemaHash = {
      algorithm: "totally-not-real-v9",
      files: { "x.ts": "totally-not-real-v9:abc" },
    };
    expect(() => validateDomain(d)).toThrow(
      /sidecar:hash-algorithm-unsupported/,
    );
  });
});

describe("validateDomain — pass 1: schema-name resolution", () => {
  it("throws when references[].from names a non-entity", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      references: [
        {
          from: "Ghost",
          field: "id",
          to: "Customer",
          cardinality: "many-to-one",
        },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(
      /sidecar:unknown-entity.*Ghost/,
    );
  });

  it("throws when references[].to names a non-entity", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      references: [
        {
          from: "Customer",
          field: "id",
          to: "Phantom",
          cardinality: "many-to-one",
        },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(
      /sidecar:unknown-entity.*Phantom/,
    );
  });
});

describe("validateDomain — pass 2: path resolution", () => {
  it("throws when references[].field path is not on the source schema", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      references: [
        {
          from: "Customer",
          field: "doesNotExist",
          to: "Customer",
          cardinality: "many-to-one",
        },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:path-unresolved/);
  });

  it("accepts a top-level path", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Order: {
          schema: Order,
          identityKind: "id-field",
          idField: "id",
        },
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      references: [
        {
          from: "Order",
          field: "customerId",
          to: "Customer",
          cardinality: "many-to-one",
        },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).not.toThrow();
  });
});

describe("validateDomain — pass 3: aggregate consistency", () => {
  it("throws when a part is claimed by two roots", () => {
    const Vendor = z.object({ id: z.string() });
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
        Vendor: { schema: Vendor, identityKind: "id-field", idField: "id" },
        Order: { schema: Order, identityKind: "id-field", idField: "id" },
      },
      aggregates: [
        { root: "Customer", parts: ["Order"] },
        { root: "Vendor", parts: ["Order"] },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(
      /sidecar:cross-aggregate-ownership/,
    );
  });

  it("throws when a part is missing from the entities map", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      aggregates: [{ root: "Customer", parts: ["Phantom"] }],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:unknown-entity.*Phantom/);
  });

  it("throws on self-aggregation", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      aggregates: [{ root: "Customer", parts: ["Customer"] }],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:self-aggregation/);
  });
});

describe("validateDomain — pass 4: inverse pairing", () => {
  it("throws when inverse.on is not an entity", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
        Order: { schema: Order, identityKind: "id-field", idField: "id" },
      },
      references: [
        {
          from: "Order",
          field: "customerId",
          to: "Customer",
          cardinality: "many-to-one",
          inverse: { on: "Phantom", field: "orders" },
        },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:unknown-entity.*Phantom/);
  });

  it("throws when inverse.on does not match the reference target", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
        Order: { schema: Order, identityKind: "id-field", idField: "id" },
      },
      references: [
        {
          from: "Order",
          field: "customerId",
          to: "Customer",
          cardinality: "many-to-one",
          // Inverse points at the wrong entity (should be Customer).
          inverse: { on: "Order", field: "orders" },
        },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:inverse-target-mismatch/);
  });
});

describe("validateDomain — pass 5: variant consistency", () => {
  it("throws when discriminator does not match a discriminatedUnion key", () => {
    const Slide = z.object({
      id: z.string(),
      visual: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a"), payload: z.string() }),
        z.object({ kind: z.literal("b"), payload: z.string() }),
      ]),
    });
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Slide: { schema: Slide, identityKind: "id-field", idField: "id" },
      },
      variants: [
        {
          from: "Slide",
          field: "visual",
          // Real discriminator is "kind"; this should fail.
          discriminator: "type",
          strategy: "variant-per-primitive",
        },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(
      /sidecar:variant-discriminator-mismatch/,
    );
  });
});

describe("validateDomain — pass 6: identity consistency", () => {
  it("throws when idField names a missing field", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "missing",
        },
      },
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:identity-field-missing/);
  });

  it("throws when idSchema is reference-unequal to the field type", () => {
    const Other = z.string();
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
          idSchema: Other,
        },
      },
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(
      /sidecar:identity-schema-mismatch/,
    );
  });

  it("requires naturalKey when identityKind is natural-key", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        AuditEvent: {
          schema: z.object({ actorId: z.string(), ts: z.string() }),
          identityKind: "natural-key",
          // Missing naturalKey.
        },
      },
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:natural-key-missing/);
  });

  it("forbids naturalKey when identityKind is not natural-key", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
          naturalKey: ["id"],
        },
      },
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:natural-key-forbidden/);
  });

  it("rejects optional fields in naturalKey", () => {
    const Audit = z.object({
      actorId: z.string(),
      ts: z.string().optional(),
    });
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        AuditEvent: {
          schema: Audit,
          identityKind: "natural-key",
          naturalKey: ["actorId", "ts"],
        },
      },
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:natural-key-optional/);
  });

  it("rejects duplicate names in naturalKey", () => {
    const Audit = z.object({ a: z.string(), b: z.string() });
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        AuditEvent: {
          schema: Audit,
          identityKind: "natural-key",
          naturalKey: ["a", "a"],
        },
      },
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:natural-key-duplicate/);
  });
});

describe("validateDomain — pass 7: variant-local references", () => {
  it("throws when a variant-local reference's from is not the generated primitive name", () => {
    const Slide = z.object({
      id: z.string(),
      visual: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a"), payload: z.string() }),
        z.object({ kind: z.literal("b"), tileRef: z.string() }),
      ]),
    });
    const Tile = z.object({ id: z.string() });
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Slide: { schema: Slide, identityKind: "id-field", idField: "id" },
        Tile: { schema: Tile, identityKind: "id-field", idField: "id" },
      },
      variants: [
        {
          from: "Slide",
          field: "visual",
          discriminator: "kind",
          strategy: "variant-per-primitive",
          references: [
            {
              // The legal name would be "Slide_B"; "Slide" alone is wrong.
              from: "Slide",
              field: "tileRef",
              to: "Tile",
              cardinality: "many-to-one",
            },
          ],
        },
      ],
      fdpm: baseFdpm,
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:variant-local-from/);
  });
});

describe("validateDomain — pass 8: DNIS field consistency", () => {
  it("throws when managedFields[].entity is unknown", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      fdpm: {
        ...baseFdpm,
        dnis: {
          documentScope: "per-plugin-workbook",
          managedFields: [
            { entity: "Phantom", field: "name", nodeKind: "paragraph" },
          ],
        },
      },
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:dnis-field-invalid/);
  });

  it("throws when managedFields[].field is not on the entity", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      fdpm: {
        ...baseFdpm,
        dnis: {
          documentScope: "per-plugin-workbook",
          managedFields: [
            { entity: "Customer", field: "missing", nodeKind: "paragraph" },
          ],
        },
      },
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:dnis-field-invalid/);
  });

  it("throws when managedFields[].field is not a string-equivalent type", () => {
    const Mixed = z.object({ id: z.string(), age: z.number() });
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Mixed,
          identityKind: "id-field",
          idField: "id",
        },
      },
      fdpm: {
        ...baseFdpm,
        dnis: {
          documentScope: "per-plugin-workbook",
          managedFields: [
            { entity: "Customer", field: "age", nodeKind: "paragraph" },
          ],
        },
      },
    });
    expect(() => validateDomain(d)).toThrow(/sidecar:dnis-field-invalid/);
  });

  it("accepts a string-typed managed field", () => {
    const d = defineDomain({
      __sidecarSpec: "0.1",
      entities: {
        Customer: {
          schema: Customer,
          identityKind: "id-field",
          idField: "id",
        },
      },
      fdpm: {
        ...baseFdpm,
        dnis: {
          documentScope: "per-plugin-workbook",
          managedFields: [
            { entity: "Customer", field: "name", nodeKind: "paragraph" },
          ],
        },
      },
    });
    expect(() => validateDomain(d)).not.toThrow();
  });
});

describe("validateDomain — happy path", () => {
  it("accepts the minimal domain", () => {
    expect(() => validateDomain(minimalDomain())).not.toThrow();
  });

  it("returns a normalized result with the same domain", () => {
    const d = minimalDomain();
    const out = validateDomain(d);
    expect(out.domain).toBe(d);
  });

  it("error carries a stable code property", () => {
    try {
      validateDomain({ entities: {} } as unknown as Domain);
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SidecarError);
      expect((e as SidecarError).code).toBe("sidecar:missing-version");
    }
  });
});
