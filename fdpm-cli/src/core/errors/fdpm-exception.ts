/**
 * §16 Error Taxonomy — FDPMException categories.
 *
 * The CLI maps each category to an exit code in the bin entry; the API
 * contract is the JSON `error` envelope returned under `--json`.
 */
export type ErrorCategory =
  | "validation"
  | "verification"
  | "not_found"
  | "conflict"
  | "permission"
  | "unauthenticated"
  | "quota"
  | "unsupported_media"
  | "host_compat"
  | "internal";

export interface ErrorEnvelope {
  category: ErrorCategory;
  message: string;
  evidence?: Record<string, unknown>;
  findings?: unknown[];
}

export class FDPMException extends Error {
  readonly category: ErrorCategory;
  readonly evidence?: Record<string, unknown>;
  readonly findings?: unknown[];

  constructor(
    category: ErrorCategory,
    message: string,
    extras?: {
      evidence?: Record<string, unknown>;
      findings?: unknown[];
      cause?: unknown;
    },
  ) {
    super(message, extras?.cause !== undefined ? { cause: extras.cause } : undefined);
    this.name = "FDPMException";
    this.category = category;
    if (extras?.evidence) this.evidence = extras.evidence;
    if (extras?.findings) this.findings = extras.findings;
  }

  toEnvelope(): ErrorEnvelope {
    const env: ErrorEnvelope = { category: this.category, message: this.message };
    if (this.evidence) env.evidence = this.evidence;
    if (this.findings) env.findings = this.findings;
    return env;
  }
}

export const HTTP_STATUS_FOR_CATEGORY: Record<ErrorCategory, number> = {
  validation: 400,
  verification: 400,
  not_found: 404,
  conflict: 409,
  permission: 403,
  unauthenticated: 401,
  quota: 413,
  unsupported_media: 415,
  host_compat: 409,
  internal: 500,
};

export const EXIT_CODE_FOR_CATEGORY: Record<ErrorCategory, number> = {
  validation: 2,
  verification: 3,
  not_found: 4,
  conflict: 5,
  permission: 6,
  unauthenticated: 7,
  quota: 8,
  unsupported_media: 9,
  host_compat: 10,
  internal: 70,
};
