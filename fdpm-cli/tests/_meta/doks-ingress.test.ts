import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CLI_ROOT = resolve(__dirname, "..", "..");
const OVERLAY_ROOT = join(CLI_ROOT, "k8s", "overlays", "doks-tor1");

function documentWithKind(source: string, kind: string): string {
  const document = source
    .split(/^---\s*$/m)
    .find((candidate) => new RegExp(`^kind: ${kind}$`, "m").test(candidate));
  expect(document, `overlay must declare a ${kind}`).toBeDefined();
  return document!;
}

describe("DOKS public ingress contract", () => {
  it("admits the MCP route to the exact shared Gateway listener", () => {
    const workload = readFileSync(join(OVERLAY_ROOT, "workload.yaml"), "utf8");
    const namespace = documentWithKind(workload, "Namespace");
    expect(namespace).toMatch(
      /^metadata:\n  name: fdpm-mcp\n  labels:\n    platform\.faz\.ai\/public-ingress: "true"$/m,
    );

    const route = readFileSync(join(OVERLAY_ROOT, "httproute.yaml"), "utf8");
    const httpRoute = documentWithKind(route, "HTTPRoute");
    expect(httpRoute).toMatch(
      /^      sectionName: https-veraformx-com-mcp$/m,
    );
  });
});
