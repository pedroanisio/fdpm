/**
 * A small but complete LogicalKnowledgeBase document for the round-trip,
 * validator and renderer tests: the Socrates syllogism as declarations, a
 * statement, two rules with a priority edge, a constraint, an entailment
 * query, a three-step proof, an argument with an attack, a two-element
 * process, provenance, a namespace, a module and an external import.
 *
 * Every node kind used here is chosen so that the fixture exercises each of
 * the derivation's lift kinds: single and array references, provenance
 * links, proof-step and process-element containment, and a non-local
 * reference (the module's external import). `transfer.test.ts` asserts the
 * fixture parses with the vendored root schema before anything else runs, so
 * a test failure downstream is never a broken fixture.
 */

type Json = Record<string, unknown>;

export const ref = (targetId: string, targetFamily?: string): Json => ({
  kind: "reference",
  targetId,
  resolution: "local",
  ...(targetFamily ? { targetFamily } : {}),
});

export const stringType: Json = { kind: "primitive_type", name: "string" };
export const varTerm = (name: string): Json => ({ kind: "variable_term", name });
export const constTerm = (id: string): Json => ({ kind: "constant_term", symbol: ref(id, "symbol") });
export const pred = (id: string, args: Json[]): Json => ({
  kind: "predicate_application_formula",
  predicate: ref(id, "symbol"),
  arguments: args,
});
export const propRef = (id: string): Json => ({ kind: "proposition_reference_formula", proposition: ref(id, "symbol") });
export const implies = (antecedent: Json, consequent: Json): Json => ({
  kind: "logical_implication_formula",
  antecedent,
  consequent,
});
export const not = (operand: Json): Json => ({ kind: "not_formula", operand });
export const forall = (names: string[], body: Json): Json => ({
  kind: "forall_formula",
  variables: names.map((name) => ({ kind: "variable_binding", name })),
  body,
});

const humanSocrates = pred("pred:Human", [constTerm("const:socrates")]);
const mortalSocrates = pred("pred:Mortal", [constTerm("const:socrates")]);
const humanImpliesMortal = implies(humanSocrates, mortalSocrates);

export const FIXTURE_ID = "kb:socrates";

/** Builds a fresh copy so a test may mutate it freely. */
export function fixtureDocument(): Json {
  return {
    kind: "logical_knowledge_base",
    id: FIXTURE_ID,
    schemaVersion: "1.0.0",
    semanticModelVersion: "1.0.0",
    title: "Socrates",
    createdAt: "2026-09-01T09:00:00Z",
    defaultSemantics: {
      truthDomain: "boolean",
      worldAssumption: "closed_world",
      explicitNegation: true,
      negationAsFailure: "stratified",
      equality: "syntactic",
      inconsistencyPolicy: "reject",
    },
    namespaces: [{ kind: "namespace_declaration", id: "ns:ex", prefix: "ex", iri: "https://example.org/kb#", preferred: true }],
    imports: [
      {
        kind: "import_declaration",
        id: "imp:foaf",
        sourceUri: "https://xmlns.com/foaf/0.1/",
        sourceFormat: "rdf",
        importMode: "declarations",
        resolutionPolicy: "optional",
      },
    ],
    modules: [
      {
        kind: "module",
        id: "mod:core",
        name: "Core",
        namespace: ref("ns:ex", "context"),
        imports: [{ kind: "reference", targetId: "ext:foaf", resolution: "external", externalUri: "https://xmlns.com/foaf/0.1/" }],
        memberRefs: [ref("pred:Human", "declaration"), ref("pred:Mortal", "declaration"), ref("rule:mortality", "rule")],
      },
    ],
    provenanceRecords: [
      {
        kind: "provenance_record",
        id: "prov:notes",
        sourceDocument: "socrates-notes.md",
        sourceFormat: "json_ld",
        conversionStatus: "native",
        creator: { name: "Course notes" },
      },
    ],
    declarations: [
      {
        kind: "predicate_declaration",
        id: "pred:Human",
        name: "Human",
        arity: 1,
        parameters: [{ name: "x", type: stringType }],
        provenance: [{ recordId: "prov:notes", role: "source", sourceFragment: "§1" }],
      },
      { kind: "predicate_declaration", id: "pred:Mortal", name: "Mortal", arity: 1, parameters: [{ name: "x", type: stringType }] },
      { kind: "constant_declaration", id: "const:socrates", name: "socrates", valueType: stringType },
      { kind: "proposition_declaration", id: "prop:rain", name: "rain" },
      { kind: "proposition_declaration", id: "prop:wet", name: "wet" },
      {
        kind: "function_declaration",
        id: "fn:age",
        name: "age",
        arity: 1,
        parameters: [{ name: "x", type: stringType }],
        returnType: stringType,
      },
      { kind: "world_declaration", id: "world:actual", name: "actual", worldKind: "actual" },
      { kind: "world_declaration", id: "world:maybe", name: "maybe", worldKind: "possible", parentWorld: ref("world:actual", "world") },
      { kind: "agent_declaration", id: "agent:alice", name: "alice", agentKind: "person" },
    ],
    statements: [
      {
        kind: "assertion_statement",
        id: "stmt:socrates-human",
        formula: humanSocrates,
        status: "asserted",
        assertedTruth: "true",
        confidence: 0.99,
        provenance: [{ recordId: "prov:notes", role: "asserted_by" }],
      },
    ],
    rules: [
      {
        kind: "derivation_rule",
        id: "rule:mortality",
        name: "All humans are mortal",
        active: true,
        phase: "derive",
        family: "derivation",
        consequenceSemantics: "derivation",
        inferenceMethod: "forward",
        variables: [{ kind: "variable_binding", name: "x" }],
        body: [pred("pred:Human", [varTerm("x")])],
        head: [pred("pred:Mortal", [varTerm("x")])],
        priority: 1,
      },
      {
        kind: "strict_rule",
        id: "rule:rain-wet",
        active: true,
        phase: "derive",
        family: "strict",
        consequenceSemantics: "derivation",
        body: [propRef("prop:rain")],
        head: [propRef("prop:wet")],
        priorityOver: [ref("rule:mortality", "rule")],
      },
    ],
    constraints: [
      {
        kind: "hard_constraint",
        id: "con:humans-mortal",
        active: true,
        formula: forall(["x"], implies(pred("pred:Human", [varTerm("x")]), pred("pred:Mortal", [varTerm("x")]))),
        violationSeverity: "violation",
      },
    ],
    queries: [
      {
        kind: "entailment_query",
        id: "q:socrates-mortal",
        premises: [humanSocrates, humanImpliesMortal],
        conclusion: mortalSocrates,
        entailmentMode: "classical",
      },
    ],
    proofs: [
      {
        kind: "proof_tree",
        id: "proof:socrates",
        proofSystem: "natural-deduction",
        conclusion: mortalSocrates,
        rootStep: ref("step:mp", "proof"),
        status: "complete",
        steps: [
          { kind: "assumption_step", id: "step:a1", premises: [], conclusion: humanSocrates, assumptionKind: "axiom" },
          { kind: "assumption_step", id: "step:a2", premises: [], conclusion: humanImpliesMortal, assumptionKind: "axiom" },
          {
            kind: "modus_ponens_step",
            id: "step:mp",
            premises: [
              { kind: "referenced_premise", reference: ref("step:a1", "proof") },
              { kind: "referenced_premise", reference: ref("step:a2", "proof") },
            ],
            conclusion: mortalSocrates,
            implication: humanImpliesMortal,
            antecedent: humanSocrates,
            appliedRules: [ref("rule:mortality", "rule")],
          },
        ],
      },
    ],
    argumentation: [
      { kind: "claim", id: "claim:mortal", formula: mortalSocrates, status: "accepted", strength: { value: 0.9, basis: "confidence" } },
      { kind: "claim", id: "claim:immortal", formula: not(mortalSocrates), status: "rejected" },
      {
        kind: "argument",
        id: "arg:syllogism",
        premiseRefs: [ref("stmt:socrates-human", "statement"), ref("rule:mortality", "rule")],
        conclusionRef: ref("claim:mortal", "argument"),
        scheme: "modus ponens",
      },
      { kind: "support_relation", id: "sup:1", supporter: ref("arg:syllogism", "argument"), supported: ref("claim:mortal", "argument") },
      { kind: "attack_relation", id: "att:1", attacker: ref("claim:immortal", "argument"), attacked: ref("claim:mortal", "argument"), attackKind: "rebuttal" },
      { kind: "attack_relation", id: "att:2", attacker: ref("claim:mortal", "argument"), attacked: ref("claim:immortal", "argument"), attackKind: "rebuttal" },
      {
        kind: "argumentation_framework",
        id: "af:main",
        argumentRefs: [ref("arg:syllogism", "argument"), ref("claim:mortal", "argument"), ref("claim:immortal", "argument")],
        relationRefs: [ref("sup:1", "argument"), ref("att:1", "argument"), ref("att:2", "argument")],
        semantics: "grounded",
        // The two claims rebut each other and stay undecided under grounded
        // semantics; the unattacked argument is the whole grounded extension.
        acceptedArguments: [ref("arg:syllogism", "argument")],
      },
    ],
    processes: [
      {
        kind: "process_model",
        id: "proc:review",
        name: "Review",
        elements: [
          { kind: "trigger", id: "trg:start", condition: propRef("prop:rain"), target: ref("seq:main", "process"), triggerMode: "once" },
          { kind: "sequence", id: "seq:main", steps: [ref("trg:start", "process")], failurePolicy: "stop" },
        ],
        entryPoints: [ref("trg:start", "process")],
      },
    ],
  };
}

/** Node ids the fixture declares, grouped the way the split should see them. */
export const FIXTURE_NODE_IDS = {
  root: [
    "ns:ex", "imp:foaf", "mod:core", "prov:notes",
    "pred:Human", "pred:Mortal", "const:socrates", "prop:rain", "prop:wet", "fn:age", "world:actual", "world:maybe", "agent:alice",
    "stmt:socrates-human", "rule:mortality", "rule:rain-wet", "con:humans-mortal", "q:socrates-mortal", "proof:socrates",
    "claim:mortal", "claim:immortal", "arg:syllogism", "sup:1", "att:1", "att:2", "af:main", "proc:review",
  ],
  steps: ["step:a1", "step:a2", "step:mp"],
  elements: ["trg:start", "seq:main"],
  external: ["ext:foaf"],
};
