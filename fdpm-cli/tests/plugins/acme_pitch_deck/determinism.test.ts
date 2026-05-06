/**
 * testcase:bridge-determinism for acme.pitch-deck.
 *
 * Same schema + same options + same pinned generatedAt produces a
 * byte-equal artefact set across runs. This is the property the CI
 * drift gate (scripts/run-bridge.ts --check) relies on. If the
 * bridge introduced non-determinism (e.g. iteration over a Set, a
 * Date.now() leak), the gate would false-positive on every CI run
 * and operators couldn't trust it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  assembleDomainProfileFromSidecar,
  stableStringify,
} from "@fdpm/zod-bridge";
import { buildPitchDeckSidecar } from "../../../plugins/acme_pitch_deck/sidecar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// .../fdpm-cli/fdpm-cli/tests/plugins/acme_pitch_deck → up 3 to fdpm-cli/fdpm-cli
const REPO_ROOT = join(__dirname, "..", "..", "..");
const PLUGIN_DIR = join(REPO_ROOT, "plugins", "acme_pitch_deck");

describe("acme.pitch-deck — bridge determinism", () => {
  it("two same-process bridge runs produce byte-equal profile JSON", () => {
    const sidecar = buildPitchDeckSidecar();
    const a = assembleDomainProfileFromSidecar({
      domain: sidecar,
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    const b = assembleDomainProfileFromSidecar({
      domain: sidecar,
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(stableStringify(a.profile)).toBe(stableStringify(b.profile));
    expect(stableStringify(a.viewPage)).toBe(stableStringify(b.viewPage));
    expect(stableStringify(a.productPage)).toBe(stableStringify(b.productPage));
  });

  it("scripts/run-bridge.ts --check passes against the committed snapshot", () => {
    // Spawn the script in a fresh node process to guard against
    // global-state leakage that would only surface across processes.
    const result = execSync(
      `npx tsx ${join(PLUGIN_DIR, "scripts", "run-bridge.ts")} --check`,
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(result).toContain("no drift");
  });

  it("re-emitting in a fresh process produces byte-equal generated/profile.json", () => {
    const onDisk = readFileSync(
      join(PLUGIN_DIR, "generated", "profile.json"),
      "utf8",
    );
    const sidecar = buildPitchDeckSidecar();
    const fresh = assembleDomainProfileFromSidecar({
      domain: sidecar,
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(stableStringify(fresh.profile) + "\n").toBe(onDisk);
  });
});
