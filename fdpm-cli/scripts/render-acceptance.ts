#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Host } from "../src/core/host.js";
import type { FieldDefT, DomainProfile, PrimitiveTypeDef, RelationTypeDef } from "../src/core/models/meta.js";
import type { PrimitiveInstance, RelationInstance, Workbook } from "../src/core/models/instance.js";
import type { RendererInput, RendererOutput } from "../src/plugin/types.js";

export type FixtureState = "empty" | "short" | "typical" | "long" | "malformed" | "dense";

interface CaseResult {
  state: FixtureState;
  status: "passed" | "failed";
  bytes?: number;
  sha256?: string;
  filename?: string;
  findings?: number;
  metrics?: Record<string, number>;
  artifactPath?: string;
  problems: string[];
  error?: string;
}

interface RendererResult {
  pluginId: string;
  rendererId: string;
  target: string;
  profileId: string | null;
  states: CaseResult[];
}

const STATES: readonly FixtureState[] = ["empty", "short", "typical", "long", "malformed", "dense"];
const LONG_COPY =
  "Internationalização accessibility resilience — " +
  "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(8) +
  " — مرحبا بالعالم — こんにちは世界 — conteúdo editorial de longa duração. ".repeat(8);

function rendererIds(profile: DomainProfile): string[] {
  return [...(profile.renderer_bindings ?? []), ...(profile.renderers ?? [])]
    .map((binding) => binding.renderer_id)
    .filter((id): id is string => id !== undefined);
}

function uid(index: number): string {
  return `01ARZ3NDEKTSV4RRFFQ${String(index).padStart(6, "0")}`.slice(0, 26);
}

function structFields(profile: DomainProfile, structId: string): readonly FieldDefT[] {
  for (const definition of profile.inline_structs ?? []) {
    if (definition.id === structId || definition.name === structId) return definition.fields;
  }
  for (const primitive of profile.primitive_types) {
    for (const definition of primitive.inline_structs ?? []) {
      if (definition.id === structId || definition.name === structId) return definition.fields;
    }
  }
  return [];
}

function fieldValue(
  field: FieldDefT,
  state: FixtureState,
  index: number,
  profile: DomainProfile,
  idsByType: ReadonlyMap<string, string>,
  depth = 0,
): unknown {
  const label = state === "long" ? LONG_COPY : `${field.name} ${index + 1}`;
  if (depth > 3) return label;
  switch (field.kind) {
    case "integer":
      return index + 1;
    case "number":
      return index + 0.5;
    case "boolean":
      return index % 2 === 0;
    case "enum":
      return field.enum_values?.[0] ?? "unknown";
    case "datetime":
      return "2026-08-29T12:00:00.000Z";
    case "id-ref":
      return idsByType.get(field.ref_type_id ?? "") ?? `${field.ref_type_id ?? "ref"}:missing`;
    case "list":
      return [fieldValue(field.item_field ?? { name: "item", kind: "string", required: false, validations: [] }, state, index, profile, idsByType, depth + 1)];
    case "struct":
      return Object.fromEntries(
        structFields(profile, field.struct_id ?? "").map((nested) => [
          nested.name,
          fieldValue(nested, state, index, profile, idsByType, depth + 1),
        ]),
      );
    case "json":
      return { label, index, valid: true };
    case "text":
    case "string":
    default:
      return label;
  }
}

function endpointType(type: RelationTypeDef, side: "source" | "target", fallback: string): string {
  const direct = side === "source" ? type.source_type_id : type.target_type_id;
  const alternatives = side === "source" ? type.source_types : type.target_types;
  if (direct) return direct;
  if (Array.isArray(alternatives) && alternatives[0]) return alternatives[0];
  return fallback;
}

function sampledTypes(types: readonly PrimitiveTypeDef[], limit: number): PrimitiveTypeDef[] {
  if (types.length <= limit) return [...types];
  const sampled: PrimitiveTypeDef[] = [];
  for (let index = 0; index < limit; index += 1) {
    sampled.push(types[Math.round((index * (types.length - 1)) / (limit - 1))]!);
  }
  return sampled;
}

export function buildFixture(profile: DomainProfile, state: FixtureState): Pick<RendererInput, "primitives" | "relations"> {
  if (state === "empty") return { primitives: [], relations: [] };

  const largeProfile = profile.primitive_types.length > 80;
  const types =
    state === "short"
      ? profile.primitive_types.slice(0, 1)
      : largeProfile && state !== "dense"
        ? sampledTypes(profile.primitive_types, 32)
        : profile.primitive_types;
  const copies = state === "dense" && !largeProfile ? 4 : 1;
  const firstIds = new Map(types.map((type, index) => [type.id, `${type.id}:acceptance-${index + 1}`]));
  const primitives: PrimitiveInstance[] = [];
  let sequence = 0;

  for (const type of types) {
    for (let copy = 0; copy < copies; copy += 1) {
      const id = copy === 0 ? firstIds.get(type.id)! : `${type.id}:acceptance-${copy + 1}`;
      const field_values =
        state === "malformed"
          ? {}
          : Object.fromEntries(
              type.fields.map((field) => [field.name, fieldValue(field, state, copy, profile, firstIds)]),
            );
      primitives.push({
        id,
        uid: uid(sequence++),
        type_id: type.id,
        field_values,
        ...(type.scoped && profile.scopes[0] ? { scope_id: profile.scopes[0].id } : {}),
        revision: 0,
      });
    }
  }

  const fallbackType = types[0]?.id;
  if (fallbackType === undefined) return { primitives, relations: [] };
  const relations: RelationInstance[] = [];
  for (const [index, type] of profile.relation_types.entries()) {
    const sourceType = endpointType(type, "source", fallbackType);
    const targetType = endpointType(type, "target", fallbackType);
    const source = firstIds.get(sourceType);
    const target = firstIds.get(targetType);
    if (source === undefined || target === undefined) continue;
    relations.push({
      id: `${type.id}:acceptance-${index + 1}`,
      uid: uid(sequence++),
      type_id: type.id,
      source_id: source,
      target_id: state === "malformed" ? "missing:endpoint" : target,
      field_values:
        state === "malformed"
          ? {}
          : Object.fromEntries(
              (type.fields ?? type.metadata_schema ?? []).map((field) => [
                field.name,
                fieldValue(field, state, index, profile, firstIds),
              ]),
            ),
      revision: 0,
    });
  }

  return { primitives, relations };
}

function structuralProblems(output: RendererOutput, expectedTarget: string): { problems: string[]; metrics: Record<string, number> } {
  const problems: string[] = [];
  const metrics: Record<string, number> = { bytes: output.bytes.byteLength };
  if (output.contentType !== expectedTarget) problems.push(`content type ${output.contentType} does not match ${expectedTarget}`);
  if (output.bytes.byteLength === 0) problems.push("output is empty");

  const textTarget = expectedTarget.startsWith("text/") || expectedTarget.includes("yaml") || expectedTarget.includes("tex");
  if (textTarget) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(output.bytes);
    metrics["characters"] = text.length;
    metrics["lines"] = text.split("\n").length;
    metrics["maxLineCharacters"] = Math.max(0, ...text.split("\n").map((line) => line.length));
    if (/\b(?:undefined|NaN|\[object Object\])\b/.test(text)) problems.push("output exposes a runtime placeholder token");
    if (expectedTarget === "text/html") {
      if (!/^<!doctype html>/i.test(text)) problems.push("HTML lacks a doctype");
      if (!/<main(?:\s|>)/i.test(text)) problems.push("HTML lacks a main landmark");
      if (/<(?:script|link)\b|@import\b|https?:\/\//i.test(text)) problems.push("HTML requests or embeds an external/runtime asset");
    }
    if (expectedTarget === "image/svg+xml") {
      if (!/<svg(?:\s|>)/i.test(text)) problems.push("SVG root is missing");
      if (!/(?:viewBox=|width=)/i.test(text)) problems.push("SVG has no sizing contract");
      if (!/(?:<title(?:\s|>)|aria-label=|aria-labelledby=)/i.test(text)) problems.push("SVG has no accessible name");
    }
  } else if (expectedTarget === "image/png") {
    const signature = [...output.bytes.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (signature !== "89504e470d0a1a0a") problems.push("PNG signature is invalid");
    if (output.bytes.byteLength >= 24) {
      const view = new DataView(output.bytes.buffer, output.bytes.byteOffset, output.bytes.byteLength);
      metrics["width"] = view.getUint32(16);
      metrics["height"] = view.getUint32(20);
    }
  } else if (expectedTarget === "application/pdf") {
    const header = new TextDecoder().decode(output.bytes.slice(0, 5));
    if (header !== "%PDF-") problems.push("PDF header is invalid");
  }
  return { problems, metrics };
}

function profileForRenderer(profiles: readonly DomainProfile[], id: string): DomainProfile | undefined {
  const direct = profiles.find((profile) => rendererIds(profile).includes(id));
  return direct;
}

function artifactFileName(name: string): string {
  const safe = name.replace(/[^a-z0-9._-]+/gi, "_");
  if (safe.length <= 120) return safe;
  const dot = safe.lastIndexOf(".");
  const extension = dot > 0 ? safe.slice(dot, dot + 17) : "";
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const fingerprint = createHash("sha256").update(safe).digest("hex").slice(0, 12);
  return `${stem.slice(0, 88)}-${fingerprint}${extension}`;
}

async function main(): Promise<void> {
  const artifactFlag = process.argv.indexOf("--artifact-dir");
  const artifactArgument = artifactFlag >= 0 ? process.argv[artifactFlag + 1] : undefined;
  if (artifactFlag >= 0 && !artifactArgument) throw new Error("--artifact-dir requires a path");
  const artifactDirectory = artifactArgument ? resolve(process.cwd(), artifactArgument) : undefined;
  if (artifactDirectory) await mkdir(artifactDirectory, { recursive: true });

  const host = new Host({ dataDir: null, builtinDirs: [resolve(process.cwd(), "plugins")], pluginPaths: [] });
  await host.load();
  const rawProfiles = host.profiles.listRaw();
  const profiles = rawProfiles.map((profile) => host.profiles.getResolved(profile.id));
  const fallbackProfile = profiles.find((profile) => profile.id === "core:empty") ?? profiles[0];
  if (fallbackProfile === undefined) throw new Error("no profiles registered");

  const renderers = host.plugins
    .listRenderers()
    .slice()
    .sort((left, right) => left.rendererId.localeCompare(right.rendererId));
  const results: RendererResult[] = [];

  for (const renderer of renderers) {
    const profile = profileForRenderer(profiles, renderer.rendererId) ?? fallbackProfile;
    const isUnbound = profile === fallbackProfile && !rendererIds(profile).includes(renderer.rendererId);
    const states: CaseResult[] = [];
    for (const state of STATES) {
      try {
        const fixture = buildFixture(profile, state);
        const workbook: Workbook = {
          id: "renderer-acceptance",
          name: state === "long" ? LONG_COPY : `Renderer acceptance — ${state}`,
          profile_id: profile.id,
          created_at: "2026-08-29T12:00:00.000Z",
          revision: 0,
        };
        const input: RendererInput = {
          workbookId: workbook.id,
          renderedAt: "2026-08-29T12:00:00.000Z",
          workbook,
          profile,
          ...fixture,
        };
        const [output, replay] = await Promise.all([
          Promise.resolve(renderer.fn(input)),
          Promise.resolve(renderer.fn(input)),
        ]);
        const { problems, metrics } = structuralProblems(output, renderer.target);
        const digest = createHash("sha256").update(output.bytes).digest("hex");
        const replayDigest = createHash("sha256").update(replay.bytes).digest("hex");
        if (digest !== replayDigest) problems.push("output is not deterministic");
        let artifactPath: string | undefined;
        if (artifactDirectory) {
          const rendererDirectory = resolve(artifactDirectory, renderer.rendererId.replace(/[^a-z0-9._-]+/gi, "_"));
          await mkdir(rendererDirectory, { recursive: true });
          const fallbackExtension = renderer.target.split("/").at(-1)?.replace(/^x-/, "") ?? "bin";
          const outputName = artifactFileName(output.filename ?? `output.${fallbackExtension}`);
          artifactPath = resolve(rendererDirectory, `${state}-${outputName}`);
          await writeFile(artifactPath, output.bytes);
        }
        states.push({
          state,
          status: problems.length === 0 ? "passed" : "failed",
          bytes: output.bytes.byteLength,
          sha256: digest,
          ...(output.filename ? { filename: output.filename } : {}),
          findings: output.findings?.length ?? 0,
          metrics,
          ...(artifactPath ? { artifactPath } : {}),
          problems,
        });
      } catch (error) {
        states.push({
          state,
          status: "failed",
          problems: ["renderer threw"],
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
      }
    }
    results.push({
      pluginId: renderer.pluginId,
      rendererId: renderer.rendererId,
      target: renderer.target,
      profileId: isUnbound ? null : profile.id,
      states,
    });
  }

  const failedCases = results.flatMap((renderer) => renderer.states.filter((state) => state.status === "failed"));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtures: STATES,
    summary: {
      profiles: profiles.length,
      renderers: results.length,
      targets: [...new Set(results.map((renderer) => renderer.target))].sort(),
      cases: results.length * STATES.length,
      passed: results.length * STATES.length - failedCases.length,
      failed: failedCases.length,
      unboundRenderers: results.filter((renderer) => renderer.profileId === null).length,
    },
    renderers: results,
  };

  const outputFlag = process.argv.indexOf("--output");
  if (outputFlag >= 0) {
    const outputPath = process.argv[outputFlag + 1];
    if (!outputPath) throw new Error("--output requires a path");
    const absolute = resolve(process.cwd(), outputPath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${absolute}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }

  if (failedCases.length > 0) process.exitCode = 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) await main();
