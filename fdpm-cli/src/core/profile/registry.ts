import type { DomainProfile } from "../models/meta.js";
import { FDPMException } from "../errors/fdpm-exception.js";
import { CORE_EMPTY_PROFILE } from "./core-empty.js";
import { CORE_RENDERER_BINDING } from "./core-renderer.js";
import { compileProfile } from "./compile.js";

/**
 * Every renderer id a profile names, in either spelling.
 *
 * `renderer_bindings` is the CLI-native list and `renderers` the
 * Python-parity alias; a profile may populate either, and the in-tree
 * plugins populate the alias. Anything reading "what renderers does this
 * profile declare" has to read both or it reads nothing.
 */
function rendererIds(profile: {
  renderer_bindings?: readonly { renderer_id?: string }[];
  renderers?: readonly { renderer_id?: string }[];
}): string[] {
  const out: string[] = [];
  for (const binding of profile.renderer_bindings ?? []) {
    if (binding.renderer_id !== undefined) out.push(binding.renderer_id);
  }
  for (const binding of profile.renderers ?? []) {
    if (binding.renderer_id !== undefined) out.push(binding.renderer_id);
  }
  return out;
}

/**
 * Give a profile that names no renderer at all Core's generic one.
 *
 * This is what makes "every profile bears a runnable renderer" an invariant
 * rather than a convention each plugin author has to remember. Without it a
 * profile with an empty binding list does not fail to render — it renders
 * through whatever `findRenderer` reaches last, which is the first plugin
 * that happened to claim the target.
 *
 * Deliberately narrow in two ways. It applies only when the list is empty,
 * so a profile's own renderer surface is never padded with one it did not
 * ask for and anything counting that surface still counts what the author
 * wrote. And it applies to the resolved view only, so `getRaw` and
 * `listRaw` keep reporting the profile exactly as registered.
 */
function withCoreRenderer(profile: DomainProfile): DomainProfile {
  if (rendererIds(profile).length > 0) return profile;
  return {
    ...profile,
    renderers: [...(profile.renderers ?? []), { ...CORE_RENDERER_BINDING }],
  };
}

/**
 * §4.3 Profile resolution — merge a profile with its `extends` chain.
 *
 * - Detects circular extension → ValueError equivalent (FDPMException
 *   `verification`).
 * - Detects ID collisions across the chain → same.
 * - Returns a single, flattened, deeply-frozen DomainProfile.
 *
 * The registry stores raw profiles (as registered) and resolved profiles
 * (lazily computed and memoised).
 */
export class ProfileRegistry {
  private readonly raw = new Map<string, DomainProfile>();
  private readonly resolved = new Map<string, DomainProfile>();

  constructor() {
    // §1.5: core:empty is registered at startup.
    this.register(CORE_EMPTY_PROFILE);
  }

  register(profile: DomainProfile): void {
    if (this.raw.has(profile.id)) {
      throw new FDPMException(
        "conflict",
        `profile already registered: ${profile.id}`,
      );
    }
    // Profiles may use the legacy Python-source spelling (`legacy_type`,
    // `category`, `applies_to`, `predicate`, `source_types`/`target_types`,
    // `name` aliases). Compile once at registration so the rest of the
    // runtime sees only the structured form.
    const compiled = compileProfile(profile);
    this.raw.set(profile.id, compiled);
    this.resolved.clear();
  }

  has(id: string): boolean {
    return this.raw.has(id);
  }

  listRaw(): DomainProfile[] {
    return Array.from(this.raw.values());
  }

  getRaw(id: string): DomainProfile {
    const p = this.raw.get(id);
    if (!p) throw new FDPMException("not_found", `profile not found: ${id}`);
    return p;
  }

  /** Resolved (extends-chain-flattened) profile. */
  getResolved(id: string): DomainProfile {
    const cached = this.resolved.get(id);
    if (cached) return cached;
    const resolved = withCoreRenderer(this.resolve(id, new Set()));
    this.resolved.set(id, resolved);
    return resolved;
  }

  private resolve(id: string, visiting: Set<string>): DomainProfile {
    if (visiting.has(id)) {
      throw new FDPMException(
        "verification",
        `circular profile extends chain: ${[...visiting, id].join(" -> ")}`,
      );
    }
    const profile = this.getRaw(id);
    if (profile.extends.length === 0) return profile;

    visiting.add(id);
    const merged: DomainProfile = {
      ...profile,
      categories: [...profile.categories],
      scopes: [...profile.scopes],
      primitive_types: [...profile.primitive_types],
      relation_types: [...profile.relation_types],
      validation_rules: [...profile.validation_rules],
      renderer_bindings: [...profile.renderer_bindings],
      // `renderers` is the Python-parity spelling of the same list, and it
      // is the one every in-tree plugin actually populates. Copying only
      // `renderer_bindings` here left a composition profile inheriting no
      // renderer at all from a parent that has three.
      renderers: [...(profile.renderers ?? [])],
      inline_structs: [...profile.inline_structs],
      extends: profile.extends,
    };

    for (const parentId of profile.extends) {
      const parent = this.resolve(parentId, visiting);
      this.mergeIn(merged, parent);
    }
    visiting.delete(id);
    return merged;
  }

  private mergeIn(target: DomainProfile, parent: DomainProfile): void {
    const collide = (collection: { id: string }[], incoming: { id: string }[], kind: string) => {
      const seen = new Set(collection.map((x) => x.id));
      for (const item of incoming) {
        if (seen.has(item.id)) {
          throw new FDPMException(
            "verification",
            `ID collision across extends chain: ${kind} ${item.id}`,
          );
        }
        collection.push(item as never);
      }
    };
    collide(target.categories, parent.categories, "category");
    collide(target.scopes, parent.scopes, "scope");
    collide(target.primitive_types, parent.primitive_types, "primitive_type");
    collide(target.relation_types, parent.relation_types, "relation_type");
    collide(target.validation_rules, parent.validation_rules, "validation_rule");
    collide(target.inline_structs, parent.inline_structs, "inline_struct");
    // Renderers are inherited, not collided: two parents may legitimately
    // offer a renderer for the same target, and the child picks between them
    // through `renderer_bindings` order. Only an exact repeat of the same
    // renderer id is dropped, so a diamond in the extends chain does not
    // list the same renderer twice.
    const known = new Set(rendererIds(target));
    for (const binding of [...parent.renderer_bindings, ...(parent.renderers ?? [])]) {
      const id = binding.renderer_id;
      if (id !== undefined && known.has(id)) continue;
      if (id !== undefined) known.add(id);
      target.renderer_bindings.push(binding);
    }
  }
}
