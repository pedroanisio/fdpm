/**
 * Field helpers for the re-crt plugin.
 *
 * Duplicated rather than imported across a plugin boundary, following the
 * planning and software_architecture plugins: plugins are isolated units and
 * a shared helper module would couple their release cycles.
 */
import type { FieldDefT, FieldValidation, PrimitiveTypeDef } from "../../src/core/models/meta.js";

interface Opts {
  required?: boolean;
  description?: string;
  validations?: FieldValidation[];
}

const base = (name: string, kind: FieldDefT["kind"], description: string, o: Opts = {}): FieldDefT => ({
  name,
  kind,
  required: o.required ?? false,
  description,
  validations: o.validations ?? [],
});

export const str = (name: string, description: string, o?: Opts): FieldDefT =>
  base(name, "string", description, o);
export const text = (name: string, description: string, o?: Opts): FieldDefT =>
  base(name, "text", description, o);
export const bool = (name: string, description: string, o?: Opts): FieldDefT =>
  base(name, "boolean", description, o);
export const int = (name: string, description: string, o?: Opts): FieldDefT =>
  base(name, "integer", description, o);
export const datetime = (name: string, description: string, o?: Opts): FieldDefT =>
  base(name, "datetime", description, o);

export const enumOf = (
  name: string,
  values: readonly string[],
  description: string,
  o?: Opts,
): FieldDefT => ({ ...base(name, "enum", description, o), enum_values: [...values] });

/**
 * A number confined to [0, 1].
 *
 * σ (resolution) and β (blocking strength) are the ontology's
 * `recrt:UnitInterval`, an `owl:withRestrictions` datatype. Here the bound is
 * two field validations, which the host enforces on write rather than leaving
 * to a reasoner that may never run.
 */
export const unitInterval = (name: string, description: string, o?: Opts): FieldDefT =>
  base(name, "number", description, {
    ...o,
    validations: [
      { kind: "min", value: 0, level: "error" },
      { kind: "max", value: 1, level: "error" },
      ...(o?.validations ?? []),
    ],
  });

/** A string constrained by a regular expression. */
export const pattern = (
  name: string,
  regex: string,
  description: string,
  o?: Opts,
): FieldDefT =>
  base(name, "string", description, {
    ...o,
    validations: [{ kind: "pattern", value: regex, level: "error" }, ...(o?.validations ?? [])],
  });

/**
 * A primitive type.
 *
 * `id_format` is mandatory in the meta-model, so it is derived from the type
 * id rather than restated at each call site: `recrt:ProofNode` yields the
 * template `recrt:proof-node:{slug}`. Uniqueness is per workbook — a reason
 * DAG is a document, and two workbooks may legitimately hold a node with the
 * same local name.
 */
export function primitive(
  id: string,
  name: string,
  description: string,
  fields: FieldDefT[],
): PrimitiveTypeDef {
  const local = id.split(":").pop() ?? id;
  const kebab = local.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return {
    id,
    name,
    description,
    fields,
    id_format: {
      pattern: `recrt:${kebab}:{slug}`,
      pattern_kind: "template",
      uniqueness: "workbook",
    },
  } as PrimitiveTypeDef;
}
