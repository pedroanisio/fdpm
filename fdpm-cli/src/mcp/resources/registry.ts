/**
 * Resource provider registry.
 *
 * Providers in declared order: render, profile, schema, guide, audit. Future providers
 * (workbook transfer, validate report, primitive view) plug in by
 * appending here and exporting from `./<name>.ts`.
 *
 * The MCP server's `resources/list` and `resources/read` handlers
 * dispatch through this registry; `dispatchRead` walks providers in
 * declared order, asking each whether it owns a given URI. The first
 * non-null match wins. URI overlap between providers is a contract
 * bug — providers MUST advertise mutually-exclusive URI shapes
 * (render owns `fdpm://workbook/...`; profile owns
 * `fdpm://profile/...` and `fdpm://profiles`; schema owns `fdpm://schema/...`; guide owns `fdpm://guide`; audit owns `fdpm://audit/...`).
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
import { profileResourceProvider } from "./profile.js";
import { schemaResourceProvider } from "./schema.js";
import { guideResourceProvider } from "./guide.js";
import { auditResourceProvider } from "./audit.js";

export const RESOURCE_PROVIDERS: ReadonlyArray<ResourceProvider<unknown>> = [
  renderResourceProvider as ResourceProvider<unknown>,
  profileResourceProvider as ResourceProvider<unknown>,
  schemaResourceProvider as ResourceProvider<unknown>,
  guideResourceProvider as ResourceProvider<unknown>,
  auditResourceProvider as ResourceProvider<unknown>,
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
