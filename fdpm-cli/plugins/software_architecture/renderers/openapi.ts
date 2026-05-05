import type { RendererFn, RendererOutput } from "../../../src/plugin/types.js";
import type { PrimitiveInstance, RelationInstance } from "../../../src/core/models/instance.js";
import { dumpYaml, type YamlValue } from "./_yaml.js";
import { projectThroughViewInstance } from "./_view.js";

/**
 * `application/x-yaml` renderer — emits an OpenAPI 3.1.0 specification
 * derived from `sw:Endpoint`, `sw:Schema`, `sw:Contract`, and `sw:Entity`
 * primitives plus their connecting relations.
 *
 * Mapping rules (deliberately conservative — anything we cannot ground in
 * the workbook graph is omitted, never invented):
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ Source primitive / relation                  → OpenAPI element  │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ Workbook name + description                   → info.title/desc  │
 *   │ Workbook profile_id version                   → info.version     │
 *   │ sw:Entity (kind=Service)                     → tag (one tag per │
 *   │                                                 service)        │
 *   │ sw:Endpoint (protocol = HTTP, with method &  → paths.{path}.    │
 *   │   path)                                         {method}        │
 *   │ sw:Exposes (Service → Endpoint)              → operation.tags   │
 *   │ sw:Schema                                    → components.      │
 *   │                                                 schemas.{name}  │
 *   │ sw:Schema.fields (SchemaField)               → schema.properties│
 *   │ sw:InputTo (Schema → Endpoint)               → requestBody      │
 *   │ sw:OutputOf (Schema → Endpoint)              → responses.200    │
 *   │ sw:Contract.error_conditions                 → responses.4xx/5xx│
 *   │   (when sw:Implements links a Service to a                      │
 *   │   Contract whose provider equals the Service                    │
 *   │   that exposes the endpoint)                                    │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Endpoints whose `protocol` is not `HTTP`, or which lack `method`/`path`,
 * are excluded — OpenAPI cannot describe them. Their ids are surfaced in
 * `info.x-fdpm-excluded-endpoints` so the omission is auditable.
 */

type Field = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  constraints?: string[];
};

type ErrorCondition = {
  name: string;
  condition: string;
  response: string;
  // gap-pass-2 #2 — typed mapping for the OpenAPI renderer.
  status_code?: string;
  schema_id?: string;
  media_type?: string;
};

// gap-pass-2 #3 — Endpoint.parameters inline_struct shape.
type Parameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  type?: string;
  schema_id?: string;
};

const HTTP_METHODS = new Set([
  "get", "put", "post", "delete", "options", "head", "patch", "trace",
]);

function fv<T = unknown>(p: PrimitiveInstance, key: string): T | undefined {
  const v = (p.field_values as Record<string, unknown>)[key];
  return v as T | undefined;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Best-effort mapping from the SchemaField string `type` to an OpenAPI
 * primitive `type`. Unknown types are emitted verbatim under
 * `x-fdpm-source-type` and the schema gets `type: string` as a safe default.
 */
function mapFieldType(raw: string): { type: string; format?: string; sourceType?: string } {
  const t = raw.toLowerCase().trim();
  if (t === "string" || t === "str" || t === "text") return { type: "string" };
  if (t === "int" || t === "integer" || t === "int32") return { type: "integer", format: "int32" };
  if (t === "int64" || t === "long") return { type: "integer", format: "int64" };
  if (t === "float" || t === "double" || t === "number") return { type: "number" };
  if (t === "bool" || t === "boolean") return { type: "boolean" };
  if (t === "date") return { type: "string", format: "date" };
  if (t === "datetime" || t === "iso8601" || t === "timestamp")
    return { type: "string", format: "date-time" };
  if (t === "uuid") return { type: "string", format: "uuid" };
  if (t === "uri" || t === "url") return { type: "string", format: "uri" };
  if (t === "email") return { type: "string", format: "email" };
  return { type: "string", sourceType: raw };
}

function schemaIdToComponentName(id: string): string {
  // schema:{name} → {name} (or fallback to a sanitized id)
  if (id.startsWith("schema:")) return id.slice("schema:".length);
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

function componentRef(schemaId: string): YamlValue {
  return { $ref: `#/components/schemas/${schemaIdToComponentName(schemaId)}` };
}

function buildSchemaObject(s: PrimitiveInstance): YamlValue {
  const name = fv<string>(s, "name") ?? schemaIdToComponentName(s.id);
  const format = fv<string>(s, "format");
  const fields = asArray<Field>(fv(s, "fields"));
  const properties: Record<string, YamlValue> = {};
  const required: string[] = [];
  for (const f of fields) {
    if (!f || typeof f.name !== "string") continue;
    const mapped = mapFieldType(typeof f.type === "string" ? f.type : "string");
    const prop: Record<string, YamlValue> = { type: mapped.type };
    if (mapped.format) prop.format = mapped.format;
    if (typeof f.description === "string" && f.description.length > 0)
      prop.description = f.description;
    if (mapped.sourceType) prop["x-fdpm-source-type"] = mapped.sourceType;
    if (Array.isArray(f.constraints) && f.constraints.length > 0)
      prop["x-fdpm-constraints"] = f.constraints as YamlValue;
    properties[f.name] = prop;
    if (f.required === true) required.push(f.name);
  }
  const obj: Record<string, YamlValue> = {
    type: "object",
    title: name,
    "x-fdpm-id": s.id,
  };
  if (format) obj["x-fdpm-format"] = format;
  // gap-pass-2 #12 — Schema versioning + deprecation.
  const version = fv<string>(s, "version");
  if (version) obj["x-fdpm-version"] = version;
  if (fv<boolean>(s, "deprecated") === true) obj.deprecated = true;
  if (Object.keys(properties).length > 0) obj.properties = properties;
  if (required.length > 0) obj.required = required;
  return obj;
}

function buildParameter(p: Parameter): YamlValue {
  const out: Record<string, YamlValue> = {
    name: p.name,
    in: p.in,
    required: p.in === "path" ? true : p.required === true,
  };
  if (p.description) out.description = p.description;
  if (p.schema_id) {
    out.schema = componentRef(p.schema_id);
  } else {
    const t = p.type ? mapFieldType(p.type) : { type: "string" as const };
    const schema: Record<string, YamlValue> = { type: t.type };
    if ("format" in t && t.format) schema.format = t.format;
    out.schema = schema;
  }
  return out;
}

function endpointOperation(
  ep: PrimitiveInstance,
  ctx: {
    serviceTagsByEndpoint: Map<string, string[]>;
    inputSchemaIds: string[];
    outputSchemaIds: string[];
    errorConditions: ErrorCondition[];
  },
): YamlValue {
  const op: Record<string, YamlValue> = {
    summary: fv<string>(ep, "name") ?? ep.id,
    operationId: ep.id.replace(/[^A-Za-z0-9_]/g, "_"),
    "x-fdpm-id": ep.id,
  };
  const tags = ctx.serviceTagsByEndpoint.get(ep.id) ?? [];
  if (tags.length > 0) op.tags = tags;

  // gap-pass-2 #12 — surface deprecation flag.
  if (fv<boolean>(ep, "deprecated") === true) {
    op.deprecated = true;
    const since = fv<string>(ep, "deprecated_since");
    if (since) op["x-fdpm-deprecated-since"] = since;
  }

  // gap-pass-2 #3 — request parameters.
  const params = asArray<Parameter>(fv(ep, "parameters")).filter(
    (p) => p && typeof p.name === "string" && typeof p.in === "string",
  );
  if (params.length > 0) {
    op.parameters = params.map(buildParameter);
  }

  if (ctx.inputSchemaIds.length > 0) {
    op.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema:
            ctx.inputSchemaIds.length === 1
              ? componentRef(ctx.inputSchemaIds[0]!)
              : { oneOf: ctx.inputSchemaIds.map(componentRef) },
        },
      },
    };
  }

  const responses: Record<string, YamlValue> = {};
  if (ctx.outputSchemaIds.length > 0) {
    responses["200"] = {
      description: "Successful response",
      content: {
        "application/json": {
          schema:
            ctx.outputSchemaIds.length === 1
              ? componentRef(ctx.outputSchemaIds[0]!)
              : { oneOf: ctx.outputSchemaIds.map(componentRef) },
        },
      },
    };
  } else {
    responses["200"] = { description: "Successful response" };
  }
  for (const ec of ctx.errorConditions) {
    if (!ec || typeof ec.name !== "string") continue;
    // gap-pass-2 #2 — prefer explicit ErrorCondition.status_code; fall back
    // to name-inference for legacy data that doesn't carry one.
    const statusKey =
      typeof ec.status_code === "string" && ec.status_code.trim().length > 0
        ? ec.status_code.trim()
        : inferStatusFromErrorName(ec.name);
    const body: Record<string, YamlValue> = {
      description: ec.response ?? ec.condition ?? ec.name,
      "x-fdpm-error-name": ec.name,
    };
    if (ec.condition) body["x-fdpm-error-condition"] = ec.condition;
    if (ec.schema_id) {
      const mediaType =
        typeof ec.media_type === "string" && ec.media_type.length > 0
          ? ec.media_type
          : "application/json";
      body.content = {
        [mediaType]: { schema: componentRef(ec.schema_id) },
      };
    }
    responses[statusKey] = body;
  }
  op.responses = responses;
  return op;
}

function inferStatusFromErrorName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("notfound") || n.includes("not_found")) return "404";
  if (n.includes("unauth") || n.includes("forbidden")) return "403";
  if (n.includes("auth")) return "401";
  if (n.includes("conflict")) return "409";
  if (n.includes("validation") || n.includes("invalid") || n.includes("badrequest")) return "400";
  if (n.includes("ratelimit") || n.includes("throttle")) return "429";
  if (n.includes("timeout")) return "504";
  if (n.includes("server") || n.includes("internal")) return "500";
  return "default";
}

export const renderOpenApi: RendererFn = (input): RendererOutput => {
  const { profile, primitives, relations, workbookId } = input;

  // Bucket primitives by type.
  const endpoints: PrimitiveInstance[] = [];
  const schemas: PrimitiveInstance[] = [];
  const contracts: PrimitiveInstance[] = [];
  const services: PrimitiveInstance[] = [];
  for (const p of primitives) {
    if (p.type_id === "sw:Endpoint") endpoints.push(p);
    else if (p.type_id === "sw:Schema") schemas.push(p);
    else if (p.type_id === "sw:Contract") contracts.push(p);
    else if (p.type_id === "sw:Entity" && fv(p, "kind") === "Service") services.push(p);
  }

  // Index relations by type for the maps we need.
  const exposesByEndpoint = new Map<string, string[]>(); // endpointId → serviceIds
  const inputByEndpoint = new Map<string, string[]>();   // endpointId → schemaIds
  const outputByEndpoint = new Map<string, string[]>();  // endpointId → schemaIds
  const implementsByService = new Map<string, string[]>(); // serviceId → contractIds
  for (const r of relations) {
    if (r.type_id === "sw:Exposes") {
      const arr = exposesByEndpoint.get(r.target_id) ?? [];
      arr.push(r.source_id);
      exposesByEndpoint.set(r.target_id, arr);
    } else if (r.type_id === "sw:InputTo") {
      const arr = inputByEndpoint.get(r.target_id) ?? [];
      arr.push(r.source_id);
      inputByEndpoint.set(r.target_id, arr);
    } else if (r.type_id === "sw:OutputOf") {
      const arr = outputByEndpoint.get(r.target_id) ?? [];
      arr.push(r.source_id);
      outputByEndpoint.set(r.target_id, arr);
    } else if (r.type_id === "sw:Implements") {
      const arr = implementsByService.get(r.source_id) ?? [];
      arr.push(r.target_id);
      implementsByService.set(r.source_id, arr);
    }
  }

  // Service id → tag name (use the entity's `name` field, fall back to id).
  const serviceTagName = new Map<string, string>();
  const tags: YamlValue[] = [];
  for (const s of services) {
    const tag = (fv<string>(s, "name") ?? s.id).trim() || s.id;
    serviceTagName.set(s.id, tag);
    const tagEntry: Record<string, YamlValue> = {
      name: tag,
      "x-fdpm-id": s.id,
    };
    const desc = fv<string>(s, "description");
    if (desc) tagEntry.description = desc;
    tags.push(tagEntry);
  }
  // Endpoint → service tags
  const serviceTagsByEndpoint = new Map<string, string[]>();
  for (const [endpointId, serviceIds] of exposesByEndpoint) {
    const t = serviceIds
      .map((sid) => serviceTagName.get(sid))
      .filter((x): x is string => typeof x === "string");
    if (t.length > 0) serviceTagsByEndpoint.set(endpointId, t);
  }

  // Contract.error_conditions per endpoint, joined via Implements.
  // For each endpoint, find all services that expose it; for each such
  // service, collect error conditions from contracts it implements.
  const errorConditionsByEndpoint = new Map<string, ErrorCondition[]>();
  const contractById = new Map(contracts.map((c) => [c.id, c]));
  for (const ep of endpoints) {
    const serviceIds = exposesByEndpoint.get(ep.id) ?? [];
    const collected: ErrorCondition[] = [];
    for (const sid of serviceIds) {
      const contractIds = implementsByService.get(sid) ?? [];
      for (const cid of contractIds) {
        const c = contractById.get(cid);
        if (!c) continue;
        for (const ec of asArray<ErrorCondition>(fv(c, "error_conditions"))) {
          if (ec && typeof ec.name === "string") collected.push(ec);
        }
      }
    }
    if (collected.length > 0) errorConditionsByEndpoint.set(ep.id, collected);
  }

  // Build paths. Skip non-HTTP and method-less / path-less endpoints.
  const paths: Record<string, Record<string, YamlValue>> = {};
  const excluded: Array<{ id: string; reason: string }> = [];
  for (const ep of endpoints) {
    const protocol = fv<string>(ep, "protocol") ?? "";
    if (protocol !== "HTTP") {
      excluded.push({ id: ep.id, reason: `protocol=${protocol || "<missing>"} (OpenAPI describes HTTP only)` });
      continue;
    }
    const method = (fv<string>(ep, "method") ?? "").toLowerCase();
    const path = fv<string>(ep, "path");
    if (!method || !HTTP_METHODS.has(method)) {
      excluded.push({ id: ep.id, reason: `method=${method || "<missing>"} (must be one of ${[...HTTP_METHODS].join(",")})` });
      continue;
    }
    if (!path || typeof path !== "string") {
      excluded.push({ id: ep.id, reason: "missing path" });
      continue;
    }
    paths[path] ??= {};
    if (paths[path][method] !== undefined) {
      excluded.push({ id: ep.id, reason: `duplicate ${method.toUpperCase()} ${path}` });
      continue;
    }
    paths[path][method] = endpointOperation(ep, {
      serviceTagsByEndpoint,
      inputSchemaIds: inputByEndpoint.get(ep.id) ?? [],
      outputSchemaIds: outputByEndpoint.get(ep.id) ?? [],
      errorConditions: errorConditionsByEndpoint.get(ep.id) ?? [],
    });
  }

  // Components.
  const componentSchemas: Record<string, YamlValue> = {};
  for (const s of schemas) {
    componentSchemas[schemaIdToComponentName(s.id)] = buildSchemaObject(s);
  }

  const info: Record<string, YamlValue> = {
    title: profile.label || profile.name || workbookId,
    version: profile.version,
    "x-fdpm-workbook-id": workbookId,
    "x-fdpm-profile-id": profile.id,
  };
  if (profile.description) info.description = profile.description;
  if (excluded.length > 0) {
    info["x-fdpm-excluded-endpoints"] = excluded as unknown as YamlValue;
  }

  // gap-pass-2 #17 — surface sw:Views that include any HTTP endpoint, so
  // operators can see "which audience does this slice of the API serve?"
  const viewSummaries: Array<{ id: string; summary: string; endpoint_count: number }> = [];
  for (const v of primitives.filter((p) => p.type_id === "sw:View")) {
    try {
      const proj = projectThroughViewInstance(
        { primitives, relations, profile },
        v,
      );
      const httpEndpointCount = proj.primitives.filter(
        (p) =>
          p.type_id === "sw:Endpoint" &&
          (p.field_values as Record<string, unknown>)["protocol"] === "HTTP",
      ).length;
      if (httpEndpointCount > 0) {
        const summary = (
          (v.field_values as Record<string, unknown>)["summary"] as string | undefined
        ) ?? "";
        viewSummaries.push({
          id: v.id,
          summary,
          endpoint_count: httpEndpointCount,
        });
      }
    } catch {
      // Views with malformed filters are skipped; the renderer never throws
      // because of view data.
    }
  }
  if (viewSummaries.length > 0) {
    info["x-fdpm-views"] = viewSummaries as unknown as YamlValue;
  }

  const doc: Record<string, YamlValue> = {
    openapi: "3.1.0",
    info,
  };
  if (tags.length > 0) doc.tags = tags;
  doc.paths = Object.keys(paths).length > 0 ? (paths as unknown as YamlValue) : {};
  if (Object.keys(componentSchemas).length > 0) {
    doc.components = { schemas: componentSchemas };
  }

  const yaml = dumpYaml(doc);
  const bytes = new TextEncoder().encode(yaml);
  return {
    bytes,
    contentType: "application/x-yaml",
    filename: "openapi.yaml",
  };
};
