import type { DomainProfile } from "../models/meta.js";
import { FDPMException } from "../errors/fdpm-exception.js";
import { CORE_EMPTY_PROFILE } from "./core-empty.js";
import { CORE_RENDERER_BINDING } from "./core-renderer.js";
import { compileProfile } from "./compile.js";
import {
  compareProfileVersions,
  formatProfileRef,
  parseProfileRef,
} from "./version.js";

/**
 * Provenance of a registered revision.
 *
 * A plugin re-registers its profiles on every startup from its own
 * `activate()`, so retiring one would do nothing but desynchronise the
 * registry from the plugin that owns it until the next boot. The retire
 * gate reads this to refuse; nothing else branches on it.
 */
export type ProfileSource =
  | { kind: "operator" }
  | { kind: "plugin"; plugin_id: string };

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
  /** Keyed by revision (`id@version`), not by id. */
  private readonly raw = new Map<string, DomainProfile>();
  private readonly resolved = new Map<string, DomainProfile>();
  /** id → versions, kept sorted ascending by `compareProfileVersions`. */
  private readonly versions = new Map<string, string[]>();
  /** Revision key → who registered it. Consumed by the retire gate. */
  private readonly sources = new Map<string, ProfileSource>();

  constructor() {
    // §1.5: core:empty is registered at startup.
    this.register(CORE_EMPTY_PROFILE);
  }

  /**
   * Register one revision.
   *
   * A second revision of a known id is accepted — the registry keys on
   * `(id, version)`. Only an exact repeat of a revision already present is
   * a `conflict`, and the error names the versions that ARE registered so
   * the caller can bump instead of guessing.
   *
   * Unpinned `extends` entries are rewritten to the parent revision that is
   * newest at registration time, when that revision is operator-persisted
   * (`pinParent`). Without the pin, a later revision of a parent silently
   * changes this profile's resolved shape — including for workbooks already
   * bound to this exact revision. A parent that is not registered yet, or
   * whose current revision belongs to a plugin, is left unpinned and
   * resolves to the newest revision at resolve time.
   */
  register(profile: DomainProfile, opts?: { source?: ProfileSource }): void {
    const key = formatProfileRef(profile.id, profile.version);
    if (this.raw.has(key)) {
      throw new FDPMException(
        "conflict",
        `profile already registered: ${key}`,
        { evidence: { profile_id: profile.id, registered_versions: this.versionsOf(profile.id) } },
      );
    }
    // Profiles may use the legacy Python-source spelling (`legacy_type`,
    // `category`, `applies_to`, `predicate`, `source_types`/`target_types`,
    // `name` aliases). Compile once at registration so the rest of the
    // runtime sees only the structured form.
    const compiled = compileProfile(profile);
    const pinned: DomainProfile = {
      ...compiled,
      extends: compiled.extends.map((ref) => this.pinParent(ref)),
    };
    this.raw.set(key, pinned);
    const known = this.versions.get(profile.id) ?? [];
    known.push(profile.version);
    known.sort(compareProfileVersions);
    this.versions.set(profile.id, known);
    this.sources.set(key, opts?.source ?? { kind: "operator" });
    this.resolved.clear();
  }

  /** Remove one revision. The ref MUST name a version. */
  unregister(ref: string): void {
    const parsed = parseProfileRef(ref);
    if (!parsed.version) {
      throw new FDPMException(
        "verification",
        `unregister requires an id@version ref, got: ${ref}`,
        { evidence: { profile_id: parsed.id, registered_versions: this.versionsOf(parsed.id) } },
      );
    }
    const key = formatProfileRef(parsed.id, parsed.version);
    if (!this.raw.has(key)) {
      throw new FDPMException("not_found", `profile not found: ${key}`, {
        evidence: { profile_id: parsed.id, registered_versions: this.versionsOf(parsed.id) },
      });
    }
    this.raw.delete(key);
    this.sources.delete(key);
    const left = this.versionsOf(parsed.id).filter((v) => v !== parsed.version);
    if (left.length > 0) this.versions.set(parsed.id, left);
    else this.versions.delete(parsed.id);
    this.resolved.clear();
  }

  /** Registered versions of one id, oldest first. */
  versionsOf(id: string): string[] {
    return [...(this.versions.get(id) ?? [])];
  }

  /** Newest registered version of an id, or undefined when none is. */
  latestVersion(id: string): string | undefined {
    const known = this.versions.get(id);
    return known && known.length > 0 ? known[known.length - 1] : undefined;
  }

  /** Oldest registered version of an id, or undefined when none is. */
  oldestVersion(id: string): string | undefined {
    return this.versions.get(id)?.[0];
  }

  /** Who registered a revision. `ref` may be bare (newest revision). */
  sourceOf(ref: string): ProfileSource | undefined {
    return this.sources.get(this.resolveKey(ref, { required: false }) ?? "");
  }

  /** True when the ref names a registered revision (bare id: any revision). */
  has(ref: string): boolean {
    return this.resolveKey(ref, { required: false }) !== null;
  }

  /** Every registered revision, including several revisions of one id. */
  listRaw(): DomainProfile[] {
    return Array.from(this.raw.values());
  }

  /** Every registered id, once, regardless of how many revisions it has. */
  listIds(): string[] {
    return Array.from(this.versions.keys());
  }

  getRaw(ref: string): DomainProfile {
    return this.raw.get(this.resolveKey(ref))!;
  }

  /** Resolved (extends-chain-flattened) profile. */
  getResolved(ref: string): DomainProfile {
    const key = this.resolveKey(ref);
    const cached = this.resolved.get(key);
    if (cached) return cached;
    const resolved = withCoreRenderer(this.resolve(key, new Set()));
    this.resolved.set(key, resolved);
    return resolved;
  }

  /**
   * Ref → revision key. A bare id resolves to the NEWEST revision; an
   * `id@version` ref resolves to exactly that revision or fails.
   */
  private resolveKey(ref: string): string;
  private resolveKey(ref: string, opts: { required: false }): string | null;
  private resolveKey(ref: string, opts?: { required: false }): string | null {
    const parsed = parseProfileRef(ref);
    const version = parsed.version ?? this.latestVersion(parsed.id);
    const key = version ? formatProfileRef(parsed.id, version) : null;
    if (key && this.raw.has(key)) return key;
    if (opts?.required === false) return null;
    throw new FDPMException("not_found", `profile not found: ${ref}`, {
      evidence: { profile_id: parsed.id, registered_versions: this.versionsOf(parsed.id) },
    });
  }

  /**
   * Pin an unpinned parent to the revision current at registration —
   * but ONLY when that revision is operator-persisted.
   *
   * A plugin re-registers its profiles from `activate()` on every boot and
   * ships exactly the revisions of its current release. Pinning a child to
   * a plugin's revision would turn the plugin's next version bump into a
   * dangling parent (`not_found` at resolve time) instead of the intended
   * inheritance. Operator revisions are the ones that persist to disk and
   * outlive the process, so they are the ones worth — and safe — to pin.
   */
  private pinParent(ref: string): string {
    const parsed = parseProfileRef(ref);
    if (parsed.version) return ref;
    const latest = this.latestVersion(parsed.id);
    if (!latest) return ref;
    const key = formatProfileRef(parsed.id, latest);
    return this.sources.get(key)?.kind === "operator" ? key : ref;
  }

  private resolve(ref: string, visiting: Set<string>): DomainProfile {
    // Normalise to a revision key before the cycle check: a chain that
    // reaches the same revision through a pinned ref and a bare one is
    // still a cycle, and comparing the two spellings would miss it.
    const id = this.resolveKey(ref);
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
