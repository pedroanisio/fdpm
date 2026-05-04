import type {
  PrimitiveInstance,
  RelationInstance,
  Project,
  ProjectTemplate,
  TestSuite,
  SuiteRunReport,
} from "../models/instance.js";
import type { Operation } from "../operations/operation.js";

/**
 * §6.1 StoreState — the projection over the operation log.
 *
 * The log is canonical; everything else here is derived. Discardable.
 */
export interface ProjectSnapshot {
  project_id: string;
  revision: number;
  state: ProjectStateSlice;
}

export interface ProjectStateSlice {
  project: Project;
  primitives: Record<string, PrimitiveInstance>;
  relations: Record<string, RelationInstance>;
  templates: Record<string, ProjectTemplate>;
  test_suites: Record<string, TestSuite>;
  /** Membership of primitives in scopes, ordered. §9.7.7. */
  scope_membership: Record<string, string[]>;
}

/**
 * SPEC-UID §14: host-level uid → location index. Every primitive and
 * relation is reachable in O(1) by uid across all loaded projects.
 * Maintained by the same replay handlers that mutate the
 * primitive/relation maps so the two views cannot drift (SPEC-UID §16
 * mitigation 2).
 */
export interface UidIndexEntry {
  project_id: string;
  kind: "primitive" | "relation";
  id: string;
}

export interface StoreState {
  operation_log: Record<string, Operation[]>;
  projects: Record<string, Project>;
  primitives: Record<string, Record<string, PrimitiveInstance>>;
  relations: Record<string, Record<string, RelationInstance>>;
  templates: Record<string, Record<string, ProjectTemplate>>;
  test_suites: Record<string, Record<string, TestSuite>>;
  suite_runs: Record<string, Record<string, SuiteRunReport[]>>;
  scope_membership: Record<string, Record<string, string[]>>;
  snapshots: Record<string, ProjectSnapshot[]>;
  uid_index: Record<string, UidIndexEntry>;
}

export function emptyState(): StoreState {
  return {
    operation_log: {},
    projects: {},
    primitives: {},
    relations: {},
    templates: {},
    test_suites: {},
    suite_runs: {},
    scope_membership: {},
    snapshots: {},
    uid_index: {},
  };
}
