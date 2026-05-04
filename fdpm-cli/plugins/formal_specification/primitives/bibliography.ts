import type { PrimitiveTypeDef } from "../../../src/core/models/meta.js";
import { enumOf, idTemplate, int, iso, primitive, str, strList } from "../_common.js";

/**
 * Bibliography category — external citations and references.
 *
 * Mirrors §I (CR-001) of src/fdpm/plugins/formal_specification.py:
 *   fs:Citation.
 *
 * v3.1 adds `category` (classification) and `currency_date` (validity
 * scoping for the references_currency rule).
 */
export const BIBLIOGRAPHY_PRIMITIVES: PrimitiveTypeDef[] = [
  primitive({
    id: "fs:Citation",
    name: "Citation",
    category: "cat:bibliography",
    description: "An external citation or reference to prior work.",
    id_format: idTemplate("citation:{key}"),
    fields: [
      str("key", "Citation key."),
      strList("authors", "Author names.", { minItems: 1 }),
      str("title", "Work title."),
      str("venue", "Publication venue.", { required: false }),
      int("year", "Publication year."),
      str("url", "URL or DOI.", { required: false }),
      enumOf(
        "category",
        "Reference category for bibliography grouping and validity scoping.",
        ["standard", "framework", "regulation", "vendor", "book", "paper"],
        { required: false },
      ),
      iso(
        "currency_date",
        "Date at which this citation was verified current. Supports references_currency discipline — stale entries are flagged after this date.",
        { required: false },
      ),
    ],
  }),
];
