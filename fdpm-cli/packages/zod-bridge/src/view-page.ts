import type { z } from "zod";
import type {
  BridgeOptions,
  PrimitiveTypeDef,
  ViewPageDescriptor,
  ViewPageFieldRender,
  ViewPagePanel,
} from "./types.js";

export interface ZodSchemaToViewPagePanelArgs {
  primitive: PrimitiveTypeDef;
  title?: string;
  override?: Partial<ViewPagePanel>;
}

export function zodSchemaToViewPagePanel(
  args: ZodSchemaToViewPagePanelArgs,
): ViewPagePanel {
  const fields: ViewPageFieldRender[] = args.primitive.fields.map((f) => {
    const out: ViewPageFieldRender = {
      name: f.name,
      kind: f.kind,
      required: f.required,
    };
    if (f.enum_values) {
      out.enum_values = f.enum_values;
      out.visual_hint = "enum-dropdown";
    }
    if (f.kind === "list" && f.item_field) {
      out.list_item_kind = f.item_field.kind;
    }
    if (f.kind === "relation" && f.relation_target_type_id) {
      out.relation_target_type_id = f.relation_target_type_id;
      out.visual_hint = "link";
    }
    if (!f.required && !out.visual_hint) {
      out.visual_hint = "optional-dim";
    }
    return out;
  });

  const panel: ViewPagePanel = {
    primitive_type_id: args.primitive.id,
    title: args.title ?? deriveTitle(args.primitive.id),
    fields,
  };

  if (args.override) {
    return { ...panel, ...args.override, fields: args.override.fields ?? panel.fields };
  }
  return panel;
}

export function buildViewPageDescriptor(
  pluginId: string,
  primitives: readonly PrimitiveTypeDef[],
  options: BridgeOptions,
  generatedAt: string,
): ViewPageDescriptor {
  const overrides = options.viewPageOverrides ?? {};
  const panels = primitives.map((p) =>
    zodSchemaToViewPagePanel({
      primitive: p,
      ...(overrides[p.id] ? { override: overrides[p.id] } : {}),
    }),
  );
  return {
    plugin_id: pluginId,
    generated_at: generatedAt,
    panels,
  };
}

function deriveTitle(primitiveTypeId: string): string {
  const last = primitiveTypeId.split(":").pop() ?? primitiveTypeId;
  return last;
}

// `z` import is reserved for future overload that accepts a schema directly.
export type { z };
