import type { CategoryDef } from "../../src/core/models/meta.js";

export const CATEGORIES: CategoryDef[] = [
  {
    id: "cat:structure",
    name: "Structure",
    description: "Document organization and composition.",
  },
  {
    id: "cat:type-system",
    name: "Type System",
    description: "Formal type definitions and schemas.",
  },
  {
    id: "cat:semantics",
    name: "Semantics",
    description: "Definitions, principles, and meaning.",
  },
  {
    id: "cat:process",
    name: "Process",
    description: "Sequential procedures and phases.",
  },
  {
    id: "cat:assurance",
    name: "Assurance",
    description: "Properties, contracts, failures, guidance.",
  },
  {
    id: "cat:mathematics",
    name: "Mathematics",
    description: "Equations, complexity analyses, and formal mathematical objects.",
  },
  {
    id: "cat:architecture",
    name: "Architecture",
    description: "Components, modules, hyperparameters, and configurations.",
  },
  {
    id: "cat:empirical",
    name: "Empirical",
    description: "Datasets, experiments, results, and ablation studies.",
  },
  {
    id: "cat:bibliography",
    name: "Bibliography",
    description: "External citations and references to prior work.",
  },
];
