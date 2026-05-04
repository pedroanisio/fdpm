import { FDPMException } from "../errors/fdpm-exception.js";

export const EXPR_RUNTIME_ERROR_CODES = [
  "unknown-name",
  "unknown-helper",
  "type-error",
  "bound-exceeded",
  "arity-error",
  "parse-error",
  "runtime-error",
  "permission-denied",
] as const;

export type ExprRuntimeErrorCode = (typeof EXPR_RUNTIME_ERROR_CODES)[number];

export class CELValidationError extends FDPMException {
  readonly rule_id?: string | undefined;
  readonly expr_code?: ExprRuntimeErrorCode | undefined;

  constructor(
    category: "verification" | "internal",
    message: string,
    rule_id?: string,
    extras?: {
      code?: ExprRuntimeErrorCode;
      evidence?: Record<string, unknown>;
    },
  ) {
    super(category, message, {
      evidence: {
        ...(rule_id !== undefined && { rule_id }),
        ...(extras?.code !== undefined && { expr_code: extras.code }),
        ...extras?.evidence,
      },
    });
    this.name = "CELValidationError";
    this.rule_id = rule_id;
    this.expr_code = extras?.code;
  }
}

export class CELParseError extends CELValidationError {
  constructor(message: string, rule_id?: string, code: ExprRuntimeErrorCode = "parse-error") {
    super("verification", message, rule_id, { code });
    this.name = "CELParseError";
  }
}

export class CELRuntimeError extends CELValidationError {
  constructor(code: ExprRuntimeErrorCode, message: string, rule_id?: string) {
    super("internal", message, rule_id, { code });
    this.name = "CELRuntimeError";
  }
}
