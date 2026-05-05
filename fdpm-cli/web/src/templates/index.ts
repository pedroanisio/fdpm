/**
 * Profile-template registry.
 *
 * A *template* is a profile-aware React renderer for a workbook. The
 * registry maps `workbook.profile_id` → component. When a workbook
 * loads, `WorkbookDetail` looks up the template; if none is registered
 * the generic JSON view is used as fallback.
 *
 * Keys are matched by `startsWith` against the `profile_id`, so a
 * single template entry covers every minor revision of a profile (e.g.
 * `profile:formal-specification:3.0` and `profile:formal-specification:3.1`
 * both match the `profile:formal-specification:` prefix).
 */
import type { ComponentType } from "react";
import type { WorkbookDetailResponse } from "../types";
import { FormalSpecificationView } from "./FormalSpecificationView";
import { PlanningView } from "./PlanningView";
import { SoftwareArchitectureView } from "./SoftwareArchitectureView";

export interface TemplateProps {
  data: WorkbookDetailResponse;
}

export type TemplateComponent = ComponentType<TemplateProps>;

interface TemplateEntry {
  /** Match `workbook.profile_id` by `startsWith`. */
  prefix: string;
  /** Human-readable name shown in the UI when this template is active. */
  label: string;
  component: TemplateComponent;
}

const TEMPLATES: readonly TemplateEntry[] = [
  {
    prefix: "profile:formal-specification:",
    label: "Formal Specification",
    component: FormalSpecificationView,
  },
  {
    prefix: "profile:planning:",
    label: "Planning",
    component: PlanningView,
  },
  {
    prefix: "profile:software-architecture:",
    label: "Software Architecture",
    component: SoftwareArchitectureView,
  },
];

export function pickTemplate(profileId: string): TemplateEntry | null {
  return TEMPLATES.find((t) => profileId.startsWith(t.prefix)) ?? null;
}
