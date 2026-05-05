/**
 * Resource provider registry.
 *
 * Slice 1 wires only `renderResourceProvider`. Future providers
 * (workbook transfer, validate report, primitive view) plug in by
 * appending here and exporting from `./<name>.ts`.
 *
 * The MCP server's `resources/list` and `resources/read` handlers
 * dispatch through this registry; `dispatchRead` walks providers in
 * declared order, asking each whether it owns a given URI. The first
 * non-null match wins. URI overlap between providers is a contract
 * bug — providers MUST advertise mutually-exclusive URI shapes.
 */
import type { Host } from "../../core/host.js";
import { FDPMException } from "../../core/errors/fdpm-exception.js";
import {
  type ResourceEntry,
  type ResourceProvider,
  type ResourceReadResult,
  type ResourceTemplateEntry,
} from "./types.js";
import { renderResourceProvider } from "./render.js";

export const RESOURCE_PROVIDERS: ReadonlyArray<ResourceProvider<unknown>> = [
  renderResourceProvider as ResourceProvider<unknown>,
];

/** Aggregate every provider's templates for `resources/templates/list`. */
export function listTemplates(host: Host): readonly ResourceTemplateEntry[] {
  const out: ResourceTemplateEntry[] = [];
  for (const p of RESOURCE_PROVIDERS) out.push(...p.templates(host));
  return out;
}

/** Aggregate every provider's concrete resources for `resources/list`. */
export function listResources(host: Host): readonly ResourceEntry[] {
  const out: ResourceEntry[] = [];
  for (const p of RESOURCE_PROVIDERS) out.push(...p.enumerate(host));
  return out;
}

/**
 * Read a resource by URI. First non-null `match()` wins. Throws
 * `not_found` when no provider owns the URI — the operator-facing
 * error needs a hint about the supported URI shape, so we include
 * the advertised templates in the evidence.
 */
export async function dispatchRead(host: Host, uri: string): Promise<ResourceReadResult> {
  for (const provider of RESOURCE_PROVIDERS) {
    const matched = provider.match(uri);
    if (matched !== null) {
      return provider.read(host, matched);
    }
  }
  throw new FDPMException(
    "not_found",
    `no resource provider matches URI: ${uri}`,
    {
      evidence: {
        uri,
        supported_templates: listTemplates(host).map((t) => t.uriTemplate),
      },
    },
  );
}
