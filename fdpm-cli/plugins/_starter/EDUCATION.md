---
disclaimer:
  notice: >-
    No information within this document should be taken for granted.
    Any statement or premise not backed by a real logical definition
    or verifiable reference may be invalid, erroneous, or a hallucination.
  generated_by: "Claude Opus 4.7 (1M context) via Claude Code"
  date: "2026-05-05"
---

# EDUCATION.md — How to Use This Template

[`README.md`](./README.md) is the **Product Page** — what the plugin is.
This file is the **operator's manual** for forking and extending it.

## Reading order if you've never written an FDPM plugin

1. **[`spec-plugin-authoring-howto`](../../docs/specs/) workbook** —
   `fdpm workbook get spec-plugin-authoring-howto --json`. Read it
   first. The starter is the worked example for that workbook's §6.
2. **[`fdpm-plugin.json`](./fdpm-plugin.json)** — the manifest. Every
   field is normative per SPEC-PLUGGABLE-ARCHITECTURE §5.1. Read top
   to bottom.
3. **[`index.ts`](./index.ts)** — the entry module. The block comments
   are pedagogical; read them in order.
4. **[`_common.ts`](./_common.ts)** — the field-builder helpers. Skim
   to learn what each helper produces.
5. **[`primitives/recipe.ts`](./primitives/recipe.ts)** — see how the
   helpers are used to declare a primitive type.
6. **[`relations.ts`](./relations.ts)** — see the
   `metadata_schema` pattern for edges that carry properties.
7. **[`validation_rules.ts`](./validation_rules.ts)** — three layers
   of validation, when to use which, and the create-time graph trap.
8. **[`renderers/shopping_list.ts`](./renderers/shopping_list.ts)** —
   the determinism contract for renderers.
9. **[`_capabilities.ts`](./_capabilities.ts)** — the imperative
   registrations for everything that isn't part of a `DomainProfile`.
10. **[`tests/starter-plugin.test.ts`](../../tests/starter-plugin.test.ts)** —
    the test pattern. Three tiers: activation, validation, renderer.
11. **[`scripts/build-starter-recipes.ts`](../../scripts/build-starter-recipes.ts)** —
    the worked-example seed. Uses the SDK's `defineProject().commit()`
    pattern to author 9 primitives + 12 relations atomically. Copy
    this when you need to populate your own plugin's example workbook.

## Forking workflow

```bash
# 1. Copy. Pick a plugin name (lowercase, hyphens-or-snake_case).
cp -r plugins/_starter plugins/<your-plugin-name>

# 2. Rename the plugin id everywhere.
cd plugins/<your-plugin-name>
sed -i 's/fdpm\.starter/fdpm.<your-plugin-name>/g' fdpm-plugin.json index.ts

# 3. Rename the profile id and namespace.
#    Pick a domain prefix (e.g. recipe → library / bug / sw-arch).
sed -i 's/profile:starter:0\.1/profile:<your-domain>:0.1/g' \
  fdpm-plugin.json index.ts validation_rules.ts _capabilities.ts \
  primitives/*.ts relations.ts ../../tests/starter-plugin.test.ts
sed -i 's/recipe:/<your-domain>:/g' \
  fdpm-plugin.json index.ts validation_rules.ts _capabilities.ts \
  primitives/*.ts relations.ts renderers/*.ts \
  ../../tests/starter-plugin.test.ts
sed -i 's/scope:starter:/scope:<your-domain>:/g' \
  fdpm-plugin.json index.ts scopes.ts primitives/*.ts \
  ../../tests/starter-plugin.test.ts
sed -i 's/cat:starter:/cat:<your-domain>:/g' \
  categories.ts primitives/*.ts

# 4. Rename the test file to match your plugin.
mv ../../tests/starter-plugin.test.ts ../../tests/<your-plugin-name>-plugin.test.ts

# 5. Edit primitives/, relations.ts, validation_rules.ts to model
#    YOUR domain. Delete what you don't need.

# 6. Build, test.
cd ../../
npm run build
npx vitest run tests/<your-plugin-name>-plugin.test.ts
```

Three sed commands above produce a buildable, loading plugin with
0 tests passing (because the test bodies still talk about recipes).
That's the pivot point: the *infrastructure* works; now you adapt
the *content* to your domain.

## What to delete when you fork

Each capability the starter ships is opt-in for your plugin. The
guidance below tells you what to delete cleanly if you don't need it.

### If your plugin has no renderers

1. Delete `renderers/` and the `renderShoppingList` import in
   `index.ts`.
2. Remove the `ctx.registerRenderer(...)` call in `activate()`.
3. Remove the `cap:renderer` entry from `fdpm-plugin.json`'s
   `capabilities[]`.
4. Drop `"render:server"` from `permissions[]` in `fdpm-plugin.json`.

### If your plugin has no transformer

1. Delete the `cap:transformer` block in `_capabilities.ts`
   (`recipeToShoppingList` + `ctx.registerTransformer(...)`).
2. Remove the `cap:transformer` entry from `fdpm-plugin.json`.

### If your plugin has no importer/exporter

1. Delete the `cap:importer` and `cap:exporter` blocks in
   `_capabilities.ts`.
2. Remove both entries from `fdpm-plugin.json`'s `capabilities[]`.
3. Drop `"import:workbook"` and `"export:workbook"` from
   `permissions[]`.

### If your plugin has no expression helper

1. Delete the `cap:expr-helper` block in `_capabilities.ts`.
2. Remove the `cap:expr-helper` entry from `fdpm-plugin.json`.
3. Drop the `expr_helper_set` pin from `host_compatibility` in
   `fdpm-plugin.json` (it's only required when you use helpers).

### What you CANNOT delete

- **`cap:profile`** — the profile is the plugin's whole reason to
  exist. No profile = your plugin contributes nothing the host
  understands.
- **The four `cap:lifecycle-hook` declarations** — even if your
  hooks do nothing (the no-op-with-debug-log pattern), they MUST be
  declared in the manifest AND exported from `index.ts`.
  Manifest-runtime parity is checked at load time.

## The §7 obligations and your fork

[`spec-plugin-authoring-howto` §7](../../docs/specs/) — the
"Documentation Obligations for Approval" section — applies to your
fork. Specifically:

1. **Product Page**: ship a substantive `README.md`. The starter's
   README is the model. Replace its content; don't ship a
   stub-with-lorem-ipsum.
2. **View Page**: your plugin's `cap:profile` IS the View Page — a
   reader derives the view from the profile's typed primitive_types
   and relation_types, with no bespoke UI. To satisfy the
   obligation: make your primitive types and their fields
   *self-explanatory* via good `description` strings. `fdpm profile
   get` and the `fdpm://profile/{id}` MCP resource render these
   descriptions verbatim.

## Things this template intentionally chose

Listed for your awareness — these are choices, not laws:

- **Single scope** (`scope:starter:workbook`). Multi-scope is rare;
  add only if you genuinely have container-within-workbook semantics.
- **Two categories**, not one or six. Two splits the type-list into
  legibly-named buckets without over-organizing.
- **Splits primitives across two files** (`recipe.ts` + `meta.ts`).
  Real plugins split when files get long (>~150 lines). DNIS keeps
  everything in one file because it has only two types.
- **Edge metadata via `metadata_schema`** rather than promoting
  RecipeUsesIngredient to a primitive type. Edge-with-properties is
  the right pattern for "the same X is used differently by different
  Ys."
- **A code validator that emits a WARNING, not an ERROR.** Errors
  reject the write; warnings let it through with a finding. For
  graph-stateful checks at primitive-create time, warnings are
  almost always the right level (the create-time graph trap).
- **Renderer output as `Uint8Array` via `TextEncoder`.** Mandatory by
  the `RendererOutput` shape; not a stylistic choice.

## Things to be careful about

- **NEVER bump the profile's `id` for additive changes.** Adding new
  primitive types, new fields (optional), new validators, new
  renderers — all additive. Don't bump. Bumping = every existing
  workbook loses its host. See `spec-plugin-authoring-howto`'s
  `property:profile-id-stability`.
- **NEVER call back into the Host from inside `activate()`** beyond
  `ctx.register*()`. activate must be deterministic and idempotent.
  Wall-clock reads, random ids, network calls — none of those belong
  in activate.
- **NEVER mutate primitives or relations from inside a renderer.**
  Renderers are read-only by construction. The host doesn't enforce
  this with capabilities — it trusts you.
- **Manifest and runtime MUST agree.** If you remove a register call,
  remove the manifest entry. If you add one, add the entry. The host
  cross-checks at load time.

## When to delete this file

When you've internalized everything in it. EDUCATION.md should not
ship in your forked plugin — it's scaffolding. README.md does the
permanent work.
