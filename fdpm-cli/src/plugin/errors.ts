import { FDPMException } from "../core/errors/fdpm-exception.js";

/**
 * Plugin-runtime error categories. They map onto Core's FDPMException
 * categories (§16) so a plugin failure surfaces consistently with any
 * other host failure.
 */
export type PluginErrorCategory =
  | "manifest"
  | "discovery"
  | "verification"
  | "lifecycle"
  | "capability"
  | "permission"
  | "host_compat"
  | "conflict";

export class PluginError extends FDPMException {
  readonly pluginCategory: PluginErrorCategory;
  readonly pluginId?: string | undefined;

  constructor(
    pluginCategory: PluginErrorCategory,
    message: string,
    extras?: { pluginId?: string; evidence?: Record<string, unknown> },
  ) {
    super(mapCategory(pluginCategory), message, {
      ...(extras?.evidence && { evidence: extras.evidence }),
    });
    this.name = "PluginError";
    this.pluginCategory = pluginCategory;
    this.pluginId = extras?.pluginId;
  }
}

function mapCategory(c: PluginErrorCategory): FDPMException["category"] {
  switch (c) {
    case "manifest":
    case "verification":
      return "verification";
    case "discovery":
    case "lifecycle":
    case "capability":
      return "internal";
    case "permission":
      return "permission";
    case "host_compat":
      return "host_compat";
    case "conflict":
      return "conflict";
  }
}
