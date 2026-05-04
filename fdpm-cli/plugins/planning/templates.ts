import type { TemplateDef } from "../../src/core/models/meta.js";

/**
 * Templates — bound to the three executable renderers shipped by this plugin.
 * Pass-2 lesson from the software_architecture plugin: ship templates and
 * renderers in the same revision so the catalogue and the runtime stay in
 * sync.
 */
export const TEMPLATES: TemplateDef[] = [
  {
    id: "plan:tpl:roadmap",
    name: "Roadmap",
    description: "Hierarchical Markdown of work breakdowns + iterations + tasks, grouped by status; active blockers section.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      person: "third",
      max_section_depth: 3,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "plan:RoadmapRenderer",
  },
  {
    id: "plan:tpl:gantt",
    name: "Gantt Chart",
    description: "Descriptive Gantt (SVG): one bar per task with planned_start AND planned_finish set; status colours; today marker.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      person: "third",
      max_section_depth: 1,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "plan:GanttSvgRenderer",
  },
  {
    id: "plan:tpl:agent-board",
    name: "Agent Board",
    description: "Kanban view (Markdown): tasks grouped by assignee; columns by status; explicit Available-to-claim queue with stale-claim detection.",
    rendering_rules: {
      voice: "active",
      tense: "present",
      // Pass-2: was `second`, but the renderer's actual prose is third
      // person (`Tasks grouped by assignee`, `### In_progress (12)`). The
      // tag should match observed output.
      person: "third",
      max_section_depth: 3,
      include_metadata: false,
      language: "en",
    },
    target_renderer: "plan:AgentBoardRenderer",
  },
];
