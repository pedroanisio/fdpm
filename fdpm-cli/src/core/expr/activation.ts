import { Environment } from "@marcbachmann/cel-js";
import { spawnSync } from "node:child_process";
import type {
  PrimitiveInstance,
  RelationInstance,
} from "../models/instance.js";
import type { PrimitiveTypeDef, DomainProfile } from "../models/meta.js";
import type { ExprProjectValue } from "./types.js";
import { mapPrimitiveToCEL } from "./types.js";
import {
  getIncoming,
  getOutgoing,
  isAcyclic,
  primitiveExists,
  targetsExist,
} from "./helpers.js";

export interface TierBGitContext {
  sha: string | null;
  branch: string | null;
  dirty: boolean | null;
}

export interface TierBOsContext {
  os: string | null;
  cpuCount: number | null;
}

export interface ValidationActivationOptions {
  project: ExprProjectValue;
  host: {
    fdpmVersion: string;
    helperSetVersion: string;
    celRevision: string;
  };
  env: {
    now: string;
    locale: string;
  };
  permissions?: ReadonlySet<string>;
  git?: TierBGitContext;
  gitProbeDir?: string;
  gitProbe?: () => TierBGitContext;
  osInfo?: TierBOsContext;
}

export function createBaseEnvironment(): Environment {
  const env = new Environment({
    limits: {
      maxDepth: 32,
      maxCallArguments: 8,
    },
  });

  // Legacy validator bindings remain available while the validation
  // consumer migrates onto the spec-owned activation model.
  env.registerVariable("instance", {
    schema: {
      id: "string",
      type_id: "string",
      field_values: "map",
      revision: "double",
      scope_id: "dyn",
    },
  });
  env.registerVariable("instance_type", { schema: { id: "string", fields: "list" } });
  env.registerVariable("profile", { schema: { id: "string", primitive_types: "list", relation_types: "list" } });
  env.registerVariable("graph", "dyn");
  env.registerVariable("doc", {
    schema: {
      id: "string",
      type_id: "string",
      fields: "map",
      revision: "double",
      scope_id: "dyn",
    },
  });
  env.registerVariable("project", {
    schema: {
      id: "string",
      profile_id: "string",
      revision: "double",
      fingerprint: "string",
      primitives: "list",
      relations: "list",
    },
  });
  env.registerVariable("env", {
    schema: {
      NOW: "string",
      LOCALE: "string",
      GIT_SHA: "dyn",
      GIT_BRANCH: "dyn",
      GIT_DIRTY: "dyn",
    },
  });
  env.registerVariable("host", {
    schema: {
      fdpm_version: "string",
      helper_set_version: "string",
      cel_revision: "string",
      os: "dyn",
      cpu_count: "dyn",
    },
  });

  env.registerFunction(
    "dyn.incoming(string):list",
    (graph: { relations: readonly RelationInstance[]; instance_id: string }, rel_id: string) =>
      getIncoming(graph.relations, graph.instance_id, rel_id),
  );
  env.registerFunction(
    "dyn.outgoing(string):list",
    (graph: { relations: readonly RelationInstance[]; instance_id: string }, rel_id: string) =>
      getOutgoing(graph.relations, graph.instance_id, rel_id),
  );
  env.registerFunction(
    "dyn.acyclic(string):bool",
    (graph: { relations: readonly RelationInstance[]; instance_id: string }, rel_id: string) =>
      isAcyclic(graph.relations, graph.instance_id, rel_id),
  );

  // Existence helpers (helper-set v1.1.0; SPEC-EXPRESSION-RUNTIME §M14
  // amendment, SPEC-CEL-VALIDATOR §6 amendment). Both expose the
  // project-primitive set the activation already carries.
  env.registerFunction(
    "dyn.exists(string):bool",
    (
      graph: {
        primitives: readonly PrimitiveInstance[];
      },
      target_id: string,
    ) => primitiveExists(graph.primitives, target_id),
  );
  env.registerFunction(
    "dyn.target_exists(string):bool",
    (
      graph: {
        primitives: readonly PrimitiveInstance[];
        relations: readonly RelationInstance[];
        instance_id: string;
      },
      type_id: string,
    ) => targetsExist(graph.relations, graph.primitives, graph.instance_id, type_id),
  );

  return env;
}

export function createValidationActivationContext(
  instance: PrimitiveInstance,
  type: PrimitiveTypeDef,
  profile: DomainProfile,
  relations: readonly RelationInstance[],
  options: ValidationActivationOptions,
) {
  const permissions = options.permissions ?? new Set<string>();
  const git = options.git ?? options.gitProbe?.() ?? probeGitContext(options.gitProbeDir);
  return {
    instance,
    instance_type: type,
    profile,
    graph: {
      instance_id: instance.id,
      relations,
      // Existence helpers (SPEC-EXPRESSION-RUNTIME §M14 helper-set v1.1.0)
      // need the project's primitive set. The activation's `project.primitives`
      // is already mapped via mapPrimitiveToCEL — its `{id}` is sufficient
      // for primitiveExists / targetsExist.
      primitives: options.project.primitives,
    },
    doc: mapPrimitiveToCEL(instance),
    project: options.project,
    env: createEnvBinding(permissions, options.env, git),
    host: createHostBinding(permissions, options.host, options.osInfo),
  };
}

function createEnvBinding(
  permissions: ReadonlySet<string>,
  env: ValidationActivationOptions["env"],
  git?: TierBGitContext,
) {
  const target: Record<string, unknown> = {
    NOW: env.now,
    LOCALE: env.locale,
  };
  defineTierBField(target, "GIT_SHA", permissions, "read:vcs", () => git?.sha ?? null);
  defineTierBField(target, "GIT_BRANCH", permissions, "read:vcs", () => git?.branch ?? null);
  defineTierBField(target, "GIT_DIRTY", permissions, "read:vcs", () => git?.dirty ?? null);
  return target;
}

function createHostBinding(
  permissions: ReadonlySet<string>,
  host: ValidationActivationOptions["host"],
  osInfo?: TierBOsContext,
) {
  const target: Record<string, unknown> = {
    fdpm_version: host.fdpmVersion,
    helper_set_version: host.helperSetVersion,
    cel_revision: host.celRevision,
  };
  defineTierBField(target, "os", permissions, "read:os-info", () => osInfo?.os ?? null);
  defineTierBField(target, "cpu_count", permissions, "read:os-info", () => osInfo?.cpuCount ?? null);
  return target;
}

function defineTierBField(
  target: Record<string, unknown>,
  key: string,
  permissions: ReadonlySet<string>,
  permission: string,
  resolve: () => unknown,
): void {
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get() {
      if (!permissions.has(permission)) {
        throw new Error(`permission-denied: ${key} requires ${permission}`);
      }
      return resolve();
    },
  });
}

function probeGitContext(cwd?: string): TierBGitContext {
  const sha = gitStdout(["rev-parse", "HEAD"], cwd);
  const branch = gitStdout(["branch", "--show-current"], cwd);
  const dirty = gitDirty(cwd);
  return {
    sha,
    branch,
    dirty,
  };
}

function gitStdout(args: string[], cwd?: string): string | null {
  const run = spawnSync("git", args, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
  });
  if (run.status !== 0) return null;
  const value = run.stdout.trim();
  return value.length > 0 ? value : null;
}

function gitDirty(cwd?: string): boolean | null {
  const run = spawnSync("git", ["status", "--porcelain"], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
  });
  if (run.status !== 0) return null;
  return run.stdout.trim().length > 0;
}
