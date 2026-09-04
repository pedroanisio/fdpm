---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-05"
---

# Starter Plugin (Recipe Book)

`fdpm.starter` — an **educational template** for FDPM plugin authors.
Not a production plugin in the usual sense. Its job is to *teach*.

It models a small recipe-book domain (Recipe, Ingredient, Tag) and
exercises every common capability kind FDPM plugins use, with
educational comments explaining the *why* of each design choice.

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

| Field             | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| Plugin id         | `fdpm.starter`                                        |
| Plugin version    | `0.1.0`                                               |
| Profile id        | `profile:starter:0.1`                                 |
| Helper-set pin    | `expr_helper_set: ">=1.1.0,<2"`                       |
| Kind              | `server`                                              |
| Host compat.      | `fdpm >=1.1, <2`                                      |
| License           | MIT                                                   |
| Entry point       | [`index.ts`](./index.ts)                              |

---

## Who this is for

You are about to write your first FDPM plugin. You have read
`spec-plugin-authoring-howto` (the workbook, not a
file — load it via `fdpm workbook get spec-plugin-authoring-howto`)
and now want to see the abstractions in working code with the *why*
visible.

This is also the canonical fork target. `cp -r plugins/_starter
plugins/<your-plugin>`, rename `recipe:` → `your:`, edit. The
[EDUCATION.md](./EDUCATION.md) sidecar walks through what to delete
and what to keep.

## What it ships

| Capability kind | Local name | Demonstrates |
| --- | --- | --- |
| `cap:profile` | `starter` | Profile registration with primitives, relations, scopes, categories, CEL rules |
| `cap:renderer` | `shopping-list` | Deterministic Markdown renderer with the spec's `bytes: Uint8Array` output shape |
| `cap:validator` | `recipe-has-ingredient` | Code-side validator (when CEL won't do) |
| `cap:expr-helper` | `minutes-to-hours` | A side-effect-free helper callable from CEL rules |
| `cap:transformer` | `recipe-to-shopping-list` | Scaffolding new primitives + relations from an existing one |
| `cap:importer` | `recipe-jsonl` | Reading JSONL bytes into a `ProjectTransfer` |
| `cap:exporter` | `recipe-jsonl` | Round-trip-symmetric inverse of the importer |
| `cap:lifecycle-hook` | `on-install` etc. | The four standard lifecycle hooks (mostly inert here) |

Total: **3 primitive types**, **2 relation types**, **2 CEL validation rules**, **1 code validator**, **1 renderer**, **1 transformer**, **1 importer + 1 exporter**, **1 expression helper**, **4 lifecycle hooks**, **11 declared capabilities**.

## Domain

A recipe is a named dish with a method and a yield. Each recipe links
to its ingredients via `recipe:Uses` — a relation that **carries
metadata on the edge itself** (`quantity`, `unit`), because the same
ingredient is used in different amounts by different recipes. Tags
classify recipes via `recipe:TaggedWith`.

```
recipe:Recipe ──recipe:Uses(quantity,unit)──▶ recipe:Ingredient
       │
       └──recipe:TaggedWith──▶ recipe:Tag
```

The `recipe:ShoppingListRenderer` aggregates every Uses edge in the
workbook into a single Markdown shopping list, summing quantities
across recipes when the unit matches.

## Try it

```bash
# 1. The plugin loads automatically on every fdpm invocation.
fdpm plugin list | grep starter

# 2. See its registered profile.
fdpm profile get profile:starter:0.1 --json

# 3. Build the example workbook (3 recipes, 4 ingredients, 12 relations).
#    The seed script doubles as a worked example of the SDK's
#    defineProject().commit() pattern — read it before authoring your own.
npx tsx fdpm-cli/scripts/build-starter-recipes.ts

# 4. Render the shopping list — see ingredient quantities aggregated
#    across recipes (tomato 1300g = 300 from caprese + 1000 from soup).
fdpm render starter-recipes-example text/markdown \
  --renderer-id recipe:ShoppingListRenderer
```

If you'd rather seed by hand to learn the create flow:

```bash
fdpm workbook create --id my-recipes --name "My Recipes" \
  --profile profile:starter:0.1
echo '{"id":"ingredient:tomato","type_id":"recipe:Ingredient","scope_id":"scope:starter:workbook","field_values":{"name":"Tomatoes","default_unit":"g","allergens":[]}}' \
  | fdpm primitive create my-recipes -f -
```

## Source map

```
plugins/_starter/
├── fdpm-plugin.json          manifest, fully populated, manifest-runtime parity
├── README.md                 this file (Product Page per spec §7)
├── EDUCATION.md              what to read first; what to delete on fork
├── index.ts                  entry module, profile, lifecycle hooks
├── _common.ts                field-builder helpers (str / shortText / numberField / enumOf / idTemplate / primitive)
├── _capabilities.ts          imperative registrations (validator / expr-helper / transformer / importer / exporter)
├── categories.ts             cat:starter:recipe / cat:starter:meta
├── scopes.ts                 scope:starter:workbook (single scope; explained in file)
├── relations.ts              recipe:Uses (with metadata!), recipe:TaggedWith
├── validation_rules.ts       2 CEL rules: servings-positive (error) + nonzero-total-time (warning)
├── primitives/
│   ├── recipe.ts             recipe:Recipe + recipe:Ingredient
│   └── meta.ts               recipe:Tag (separate file to demonstrate the split)
└── renderers/
    └── shopping_list.ts      text/markdown aggregator with determinism comments
```

Tests live at [`tests/starter-plugin.test.ts`](../../tests/starter-plugin.test.ts) — three tiers (activation / validation / renderer determinism), 6 cases.

## What it does NOT do

Honest list of gaps. These are NOT pedagogically motivated; some are
genuinely missing-from-FDPM-today, some are explicit out-of-scope for
a starter:

- **No client UI module.** There is no first-class way for a plugin
  to ship a TS module a client consumes as a per-profile view; that's
  `cap:ui:*`-shaped territory the manifest schema accepts but the
  host doesn't dispatch (see `spec-plugin-authoring-howto` §7).
- **No View Page beyond the synthesised default.** A recipe workbook
  falls back to the group-by-type view derived from the profile —
  which is honest about the §7 obligation a plugin without a rich
  client view satisfies via its `cap:profile` alone.
- **No scoped uniqueness demo.** Single scope, by design (see
  [scopes.ts](./scopes.ts)).
- **No inline-struct or constraints demo.** These are real
  capabilities (planning's `Alternative` inline struct, formal-spec's
  `constraints[]`) but adding them here would dilute the educational
  surface. Read the planning plugin to see them.
- **No `cap:route`.** The schema accepts it; nothing in-tree
  registers one. When the host learns to dispatch `cap:route` we'll
  add an example.
