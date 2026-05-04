/**
 * Reusable type-id lists matching the Python source.
 * Mirrors `_ALL_PRIMITIVE_IDS` and `_CONTAINABLE_IDS` from
 * src/fdpm/plugins/formal_specification.py:34-71.
 */
export const ALL_PRIMITIVE_IDS: string[] = [
  "fs:AblationStudy",
  "fs:Actor",
  "fs:Assumption",
  "fs:Audience",
  "fs:ChangeRecord",
  "fs:Citation",
  "fs:ComplexityAnalysis",
  "fs:Component",
  "fs:Configuration",
  "fs:Contract",
  "fs:Dataset",
  "fs:Definition",
  "fs:DesignDecision",
  "fs:EnumDef",
  "fs:Equation",
  "fs:Example",
  "fs:Experiment",
  "fs:FailureMode",
  "fs:Figure",
  "fs:FormalProperty",
  "fs:Guideline",
  "fs:Hyperparameter",
  "fs:Invariant",
  "fs:Limitation",
  "fs:Notation",
  "fs:Phase",
  "fs:Principle",
  "fs:Requirement",
  "fs:Result",
  "fs:Section",
  "fs:TestCase",
  "fs:TypeDefinition",
];

export const CONTAINABLE_IDS: string[] = ALL_PRIMITIVE_IDS.filter(
  (t) => t !== "fs:Section",
);
