/**
 * testcase:bridge-determinism for acme.business-deck.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  assembleDomainProfileFromSidecar,
  stableStringify,
} from "@fdpm/zod-bridge";
import { buildBusinessDeckSidecar } from "../../../plugins/acme_business_deck/sidecar.js";
import { NODE_COMMAND, tsxArgs } from "../../_helpers/process.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const PLUGIN_DIR = join(REPO_ROOT, "plugins", "acme_business_deck");

describe("acme.business-deck — bridge determinism", () => {
  it("two same-process bridge runs produce byte-equal artefacts", () => {
    const sidecar = buildBusinessDeckSidecar();
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
    const result = execFileSync(
      NODE_COMMAND,
      tsxArgs([join(PLUGIN_DIR, "scripts", "run-bridge.ts"), "--check"]),
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(result).toContain("no drift");
  });

  it("re-emitting in a fresh process produces byte-equal generated/profile.json", () => {
    const onDisk = readFileSync(
      join(PLUGIN_DIR, "generated", "profile.json"),
      "utf8",
    );
    const sidecar = buildBusinessDeckSidecar();
    const fresh = assembleDomainProfileFromSidecar({
      domain: sidecar,
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(stableStringify(fresh.profile) + "\n").toBe(onDisk);
  });
});
