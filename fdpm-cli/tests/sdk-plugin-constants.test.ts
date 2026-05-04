import { describe, it, expect } from "vitest";
import {
  PROFILE_ID as SW_PROFILE_ID,
  SCOPE_IDS as SW_SCOPE_IDS,
  PROFILE as SW_PROFILE,
} from "../plugins/software_architecture/index.js";
import {
  PROFILE_ID as FS_PROFILE_ID,
  SCOPE_IDS as FS_SCOPE_IDS,
  PROFILE as FS_PROFILE,
} from "../plugins/formal_specification/index.js";

/**
 * Profile-id and scope-id constants must stay in lockstep with the
 * actual DomainProfile object each plugin exports. If a plugin author
 * renames a scope without updating the SCOPE_IDS map, this test
 * catches the drift.
 */

describe("plugin: software_architecture exposed constants", () => {
  it("PROFILE_ID equals PROFILE.id", () => {
    expect(SW_PROFILE_ID).toBe(SW_PROFILE.id);
  });

  it("SCOPE_IDS contains every scope the profile actually declares", () => {
    const declared = SW_PROFILE.scopes.map((s) => s.id).sort();
    const exposed = Object.values(SW_SCOPE_IDS).sort();
    expect(exposed).toEqual(declared);
  });

  it("every SCOPE_IDS value resolves to a real scope", () => {
    const declared = new Set(SW_PROFILE.scopes.map((s) => s.id));
    for (const id of Object.values(SW_SCOPE_IDS)) {
      expect(declared.has(id)).toBe(true);
    }
  });
});

describe("plugin: formal_specification exposed constants", () => {
  it("PROFILE_ID equals PROFILE.id", () => {
    expect(FS_PROFILE_ID).toBe(FS_PROFILE.id);
  });

  it("SCOPE_IDS contains every scope the profile actually declares", () => {
    const declared = FS_PROFILE.scopes.map((s) => s.id).sort();
    const exposed = Object.values(FS_SCOPE_IDS).sort();
    expect(exposed).toEqual(declared);
  });

  it("every SCOPE_IDS value resolves to a real scope", () => {
    const declared = new Set(FS_PROFILE.scopes.map((s) => s.id));
    for (const id of Object.values(FS_SCOPE_IDS)) {
      expect(declared.has(id)).toBe(true);
    }
  });
});
