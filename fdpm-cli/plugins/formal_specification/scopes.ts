import type { ScopeDef } from "../../src/core/models/meta.js";

export const SCOPES: ScopeDef[] = [
  {
    id: "scope:fs:specification",
    name: "Specification",
    rank: 1,
    description: "The formal document structure.",
  },
  {
    id: "scope:fs:method",
    name: "Method",
    rank: 2,
    description: "The method being specified.",
  },
  {
    id: "scope:fs:practice",
    name: "Practice",
    rank: 3,
    description: "Practical usage and guidance.",
  },
  {
    id: "scope:fs:paper:theory",
    name: "Theory",
    rank: 4,
    description: "Mathematical foundations and complexity analysis.",
  },
  {
    id: "scope:fs:paper:architecture",
    name: "Architecture",
    rank: 5,
    description: "Model structure, components, configuration.",
  },
  {
    id: "scope:fs:paper:training",
    name: "Training",
    rank: 6,
    description: "Optimisation, regularisation, schedule.",
  },
  {
    id: "scope:fs:paper:evaluation",
    name: "Evaluation",
    rank: 7,
    description: "Experiments, benchmarks, ablation studies.",
  },
  {
    id: "scope:fs:execution",
    name: "Execution",
    rank: 8,
    description:
      "Typed execution roadmap steps with state components, increments, and assumption ledger.",
  },
];

export const SCOPE_SETS: Record<string, string[]> = {
  process: [
    "scope:fs:specification",
    "scope:fs:method",
    "scope:fs:practice",
    "scope:fs:execution",
  ],
  paper: [
    "scope:fs:paper:theory",
    "scope:fs:paper:architecture",
    "scope:fs:paper:training",
    "scope:fs:paper:evaluation",
  ],
};

export const DEFAULT_SCOPE_SET = "process";
