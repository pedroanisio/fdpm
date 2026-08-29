/**
 * A valid two-style StyleRegistry in the SOURCE schema's shape (camelCase),
 * used as the ingest fixture.
 *
 * It is deliberately not minimal: it exercises all ten grammar sections,
 * all three compliance-check kinds, defining rules with exemplars, the
 * forbidden-colour → prohibition linkage, a movement with a parent, an
 * influence edge between the two styles, and a WCAG AA contrast contract
 * including a `ui-component` pair (which requires version >= 2.1).
 *
 * The numbers are chosen to satisfy the derivation invariants, not by
 * accident: `tokens.shape.strokeWeight` is `stroke.weight × spacing
 * .baseUnit` exactly, and `contrast.tonalRange` is "bimodal" against
 * `lighting.kind: "none"` — bimodal is only incompatible with CONTINUOUS
 * shading, so the pairing is legal and worth asserting.
 *
 * Historical claims here are illustrative test data. They are not offered
 * as scholarship, and the `source` fields name the kind of citation the
 * schema requires rather than asserting a verified accession record.
 */

type Json = Record<string, unknown>;

/** Rules-and-prohibitions base every grammar section carries. */
function ruled(rules: Json[] = [], prohibitions: Json[] = []): Json {
  return { rules, prohibitions };
}

/**
 * The eight grammar sections that carry no style-specific content in this
 * fixture, so each style only has to spell out what differs.
 */
function baselineGrammar(overrides: Partial<Record<string, Json>> = {}): Json {
  const base: Record<string, Json> = {
    line: {
      ...ruled(),
      kind: "lines",
      stroke: { kind: "uniform", weight: 0.125 },
      strokeRoles: ["contour", "structural"],
      quality: "mechanical",
      contourHierarchy: "uniform",
    },
    color: {
      ...ruled(),
      applicationMethods: ["flat"],
      gradients: "forbidden",
      lighting: { kind: "none" },
      palette: [
        { name: "ink", hex: "#1A1A1A", role: "primary", printingOrigin: "traditional-pigment" },
        { name: "paper", hex: "#FFFFFF", role: "background", printingOrigin: "traditional-pigment" },
      ],
      forbiddenColors: [],
      paletteDerivationRule: null,
      colorRelationships: ["restricted-primary"],
      paletteLimit: { kind: "capped", max: 8 },
    },
    form: {
      ...ruled(),
      primitives: ["circle", "square", "triangle"],
      proportionSystem: "geometric-reduction",
      symmetry: "asymmetric-dominant",
      edgeTreatment: "hard",
      structuralExposure: "maximally-exposed",
    },
    space: {
      ...ruled(),
      perspectiveSystem: "flat",
      depthEncoding: { kind: "encoded", methods: ["overlap"] },
      frameBehavior: "respected",
    },
    surface: {
      ...ruled(),
      renderingMethods: ["flat-fill"],
      materialHonesty: "required",
      dominantTexture: "smooth",
    },
    typography: {
      ...ruled(),
      typefaces: {
        heading: {
          classification: "latin-geometric-sans",
          exemplars: ["Universal", "Futura"],
          weightRange: { min: 4, span: 1 },
          permitsItalic: false,
          casing: "required-lowercase",
        },
        body: {
          classification: "latin-geometric-sans",
          exemplars: ["Futura"],
          weightRange: { min: 4, span: 0 },
          permitsItalic: false,
          casing: "sentence-case",
        },
      },
      typeImageRelation: "integrated",
      baselineGrid: { kind: "grid", unit: 1 },
      letterSpacing: "normal",
    },
    composition: {
      ...ruled(),
      layout: { kind: "modular-grid", columns: 12, gutter: 2 },
      hierarchyMethods: ["size", "weight"],
      negativeSpace: "functional",
      permitsBleed: false,
    },
    contrast: {
      ...ruled(),
      tonalRange: "bimodal",
      contrastRoles: ["emphasis", "information"],
    },
    iconography: {
      ...ruled(),
      motifs: [{ name: "grid", description: "The orthogonal module made visible.", frequency: "ubiquitous" }],
      figureTreatment: "abstracted",
    },
    motion: { ...ruled(), kind: "static" },
  };
  return { ...base, ...overrides };
}

/** Token layer consistent with `baselineGrammar` (stroke 0.125 × 8 = 1px). */
function baselineTokens(overrides: Partial<Record<string, Json>> = {}): Json {
  const base: Record<string, Json> = {
    colors: { kind: "rendered", tokens: { ink: "#1A1A1A", paper: "#FFFFFF", accent: "#D2232A" } },
    typography: {
      kind: "rendered",
      fontStacks: { heading: "Futura, sans-serif", body: "Futura, sans-serif" },
      scaleTokens: { sm: 12, base: 16, lg: 24 },
      lineHeights: { tight: 1.1, base: 1.5, loose: 1.8 },
      letterSpacingTokens: { normal: 0, wide: 0.08 },
      weightMap: { "4": 400, "5": 500 },
    },
    spacing: { kind: "rendered", baseUnit: 8, scale: { xs: 4, sm: 8, md: 16 } },
    shape: { kind: "rendered", borderRadius: { none: 0 }, strokeWeight: 1, strokeAlignment: "center" },
    motion: { kind: "omitted" },
    promptFragment: {
      kind: "rendered",
      positive: "geometric sans-serif, primary colours, flat fill, orthogonal grid",
      negative: "ornament, gradient, drop shadow, texture",
    },
    accessibility: {
      kind: "wcag",
      version: "2.1",
      level: "aa",
      contrastPairs: [
        { foreground: "ink", background: "paper", usage: "normal-text" },
        { foreground: "accent", background: "paper", usage: "ui-component" },
      ],
    },
  };
  return { ...base, ...overrides };
}

const BAUHAUS: Json = {
  schemaVersion: "3.1.0",
  locale: "en-US",
  provenance: {
    createdBy: "fdpm-style-fixture",
    createdAt: "2026-08-28T00:00:00Z",
    sourceSystem: "tests/plugins/style/fixtures/registry.ts",
  },
  identity: {
    id: "bauhaus",
    code: "BAU",
    name: "Bauhaus",
    aliases: ["Staatliches Bauhaus"],
    period: { kind: "closed", start: 1919, end: 1933 },
    geographicCenters: ["Weimar", "Dessau", "Berlin"],
    parentMovement: "modernism",
    negatedMovements: ["historicism"],
    influencedStyles: ["de-stijl"],
    originMedium: { kind: "single", family: "planographic", process: "lithography" },
  },
  philosophy: {
    ornamentStance: "prohibited",
    machineAttitude: "collaborative",
    formFunctionRelation: "form-follows-function",
    humanRelation: "body-conforming",
    axioms: [
      {
        statement: "Art and technology — a new unity.",
        source: "Gropius, slogan of the 1923 Bauhaus exhibition, Weimar.",
      },
    ],
  },
  grammar: baselineGrammar({
    line: {
      ...ruled(
        [
          {
            id: "BAU-L-01",
            kind: "requires",
            statement: "Stroke weight is uniform across the whole artifact.",
            weight: "defining",
            exemplars: ["bau-wagenfeld-lamp"],
          },
        ],
        [
          {
            id: "BAU-L-P01",
            kind: "forbids",
            statement: "No modulated or calligraphic line weight.",
            weight: "strong",
          },
        ],
      ),
      kind: "lines",
      stroke: { kind: "uniform", weight: 0.125 },
      strokeRoles: ["contour", "structural"],
      quality: "mechanical",
      contourHierarchy: "uniform",
    },
    color: {
      ...ruled(
        [
          {
            id: "BAU-C-01",
            kind: "requires",
            statement: "Colour is applied as flat unmodulated fill within shape boundaries.",
            weight: "defining",
            exemplars: ["bau-bayer-universal"],
          },
        ],
        [
          {
            id: "BAU-C-P01",
            kind: "forbids",
            statement: "No earth or historicist pigments; the palette is reduced to primaries plus neutrals.",
            weight: "defining",
            exemplars: ["bau-bayer-universal"],
          },
        ],
      ),
      applicationMethods: ["flat"],
      gradients: "forbidden",
      lighting: { kind: "none" },
      palette: [
        { name: "ink", hex: "#1A1A1A", role: "primary", printingOrigin: "traditional-pigment" },
        { name: "paper", hex: "#FFFFFF", role: "background", printingOrigin: "traditional-pigment" },
        { name: "signal-red", hex: "#D2232A", role: "accent", printingOrigin: "traditional-pigment" },
      ],
      forbiddenColors: [
        {
          name: "ochre",
          hex: "#CC7722",
          reason: "Reads as historicist earth palette the school defined itself against.",
          prohibitedBy: "BAU-C-P01",
        },
      ],
      paletteDerivationRule: null,
      colorRelationships: ["restricted-primary"],
      paletteLimit: { kind: "capped", max: 8 },
    },
    form: {
      ...ruled([
        {
          id: "BAU-F-01",
          kind: "requires",
          statement: "Form reduces to the elementary geometric primitives.",
          weight: "strong",
        },
      ]),
      primitives: ["circle", "square", "triangle"],
      proportionSystem: "geometric-reduction",
      symmetry: "asymmetric-dominant",
      edgeTreatment: "hard",
      structuralExposure: "maximally-exposed",
    },
    typography: {
      ...ruled([
        {
          id: "BAU-T-01",
          kind: "requires",
          statement: "Typography is geometric sans-serif, set lowercase.",
          weight: "defining",
          exemplars: ["bau-bayer-universal"],
        },
      ]),
      typefaces: {
        heading: {
          classification: "latin-geometric-sans",
          exemplars: ["Universal", "Futura"],
          weightRange: { min: 4, span: 1 },
          permitsItalic: false,
          casing: "required-lowercase",
        },
        body: {
          classification: "latin-geometric-sans",
          exemplars: ["Futura"],
          weightRange: { min: 4, span: 0 },
          permitsItalic: false,
          casing: "sentence-case",
        },
      },
      typeImageRelation: "integrated",
      baselineGrid: { kind: "grid", unit: 1 },
      letterSpacing: "normal",
    },
    composition: {
      ...ruled([
        {
          id: "BAU-CP-01",
          kind: "requires",
          statement: "Composition sits on an explicit modular grid.",
          weight: "advisory",
        },
      ]),
      layout: { kind: "modular-grid", columns: 12, gutter: 2 },
      hierarchyMethods: ["size", "weight"],
      negativeSpace: "functional",
      permitsBleed: false,
    },
  }),
  tokens: baselineTokens(),
  compliance: {
    minimumPassRatio: 0.8,
    checks: [
      {
        kind: "binary",
        id: "CC-BAU-01",
        testsRule: "BAU-L-01",
        description: "Every stroke in the artifact measures the same weight.",
        weight: "defining",
      },
      {
        kind: "threshold",
        id: "CC-BAU-02",
        testsRule: "BAU-L-P01",
        description: "Ratio of the widest to the narrowest stroke.",
        weight: "strong",
        threshold: { metric: "stroke-weight-ratio", operator: "<=", value: 1.05, unit: "ratio" },
      },
      {
        kind: "qualitative",
        id: "CC-BAU-03",
        testsRule: "BAU-C-01",
        description: "Colour areas read as flat.",
        weight: "defining",
        criteria: "No perceptible tonal transition within a single colour area at reading distance.",
      },
      {
        kind: "binary",
        id: "CC-BAU-04",
        testsRule: "BAU-C-P01",
        description: "No colour outside the declared palette appears in the artifact.",
        weight: "defining",
      },
      {
        kind: "binary",
        id: "CC-BAU-05",
        testsRule: "BAU-F-01",
        description: "Every closed form decomposes into circle, square or triangle.",
        weight: "strong",
      },
      {
        kind: "binary",
        id: "CC-BAU-06",
        testsRule: "BAU-T-01",
        description: "All type is geometric sans-serif and lowercase.",
        weight: "defining",
      },
    ],
  },
  references: {
    primary: [
      {
        id: "bau-wagenfeld-lamp",
        title: "Table Lamp MT 8",
        creators: ["Wilhelm Wagenfeld", "Carl Jacob Jucker"],
        year: 1924,
        medium: "glass and metal",
        exemplifies: "Uniform stroke and elementary geometry carried into three dimensions.",
        source: "Museum collection record — institution and accession number.",
      },
      {
        id: "bau-bayer-universal",
        title: "Universal typeface",
        creators: ["Herbert Bayer"],
        year: 1925,
        medium: "typeface design",
        exemplifies: "Geometric sans-serif construction with the uppercase abolished.",
        source: "Published catalogue raisonné entry.",
      },
    ],
    secondary: [],
    counterExamples: [
      {
        id: "bau-victorian-ornament",
        title: "The Grammar of Ornament",
        creators: ["Owen Jones"],
        year: 1856,
        medium: "chromolithographed book",
        exemplifies: "The historicist ornamental programme the school defined itself against.",
        source: "Peer-reviewed monograph on nineteenth-century design reform.",
      },
    ],
  },
};

const DE_STIJL: Json = {
  schemaVersion: "3.1.0",
  locale: "en-US",
  provenance: { createdBy: "fdpm-style-fixture", createdAt: "2026-08-28T00:00:00Z" },
  identity: {
    id: "de-stijl",
    code: "DST",
    name: "De Stijl",
    aliases: ["Neoplasticism"],
    period: { kind: "closed", start: 1917, end: 1931 },
    geographicCenters: ["Leiden"],
    parentMovement: "modernism",
    negatedMovements: [],
    influencedStyles: [],
    originMedium: { kind: "single", family: "direct-application", process: "oil-on-canvas" },
  },
  philosophy: {
    ornamentStance: "prohibited",
    machineAttitude: "aestheticized",
    formFunctionRelation: "form-is-function",
    humanRelation: "body-indifferent",
    axioms: [
      {
        statement: "The new plastic expression admits only the straight line and the right angle.",
        source: "Mondrian, 'Neo-Plasticism in Pictorial Art', De Stijl, 1917-1918.",
      },
    ],
  },
  grammar: baselineGrammar({
    composition: {
      ...ruled([
        {
          id: "DST-CP-01",
          kind: "requires",
          statement: "Only horizontal and vertical divisions of the picture plane.",
          weight: "advisory",
        },
      ]),
      layout: { kind: "modular-grid", columns: 6, gutter: 2 },
      hierarchyMethods: ["position", "color"],
      negativeSpace: "functional",
      permitsBleed: false,
    },
  }),
  tokens: baselineTokens(),
  compliance: {
    minimumPassRatio: 0.75,
    checks: [
      {
        kind: "binary",
        id: "CC-DST-01",
        testsRule: "DST-CP-01",
        description: "No diagonal division appears in the composition.",
        weight: "advisory",
      },
    ],
  },
  references: {
    primary: [
      {
        id: "dst-composition-ii",
        title: "Composition II in Red, Blue, and Yellow",
        creators: ["Piet Mondrian"],
        year: 1930,
        medium: "oil on canvas",
        exemplifies: "Orthogonal division with a restricted primary palette.",
        source: "Museum collection record — institution and accession number.",
      },
    ],
    secondary: [],
    counterExamples: [
      {
        id: "dst-art-nouveau-whiplash",
        title: "Whiplash (Peitschenhieb)",
        creators: ["Hermann Obrist"],
        year: 1895,
        medium: "embroidered wall hanging",
        exemplifies: "The curvilinear organic line the movement rejected outright.",
        source: "Peer-reviewed monograph on Jugendstil.",
      },
    ],
  },
};

/** A registry that satisfies every invariant in the profile. */
export function validRegistry(): Json {
  return {
    schemaVersion: "3.1.0",
    locale: "en-US",
    provenance: { createdBy: "fdpm-style-fixture", createdAt: "2026-08-28T00:00:00Z" },
    movements: [
      { id: "modernism", name: "Modernism", aliases: [], period: { kind: "open", start: 1890 }, parentMovement: null },
      {
        id: "historicism",
        name: "Historicism",
        aliases: ["Revivalism"],
        period: { kind: "closed", start: 1830, end: 1900 },
        parentMovement: null,
      },
    ],
    styles: [BAUHAUS, DE_STIJL],
  };
}

/**
 * Deep-clone the valid registry and hand it to `mutate`, so a test can
 * break exactly one thing without disturbing the rest.
 */
export function registryWith(mutate: (r: Json) => void): Json {
  const clone = JSON.parse(JSON.stringify(validRegistry())) as Json;
  mutate(clone);
  return clone;
}

/** The Bauhaus style object inside a cloned registry. */
export function bauhausOf(registry: Json): Json {
  return (registry.styles as Json[])[0]!;
}

/**
 * Rename a rule everywhere a style addresses it — the rule itself and any
 * compliance check that tests it.
 *
 * A test that breaks a rule id's *format* must not also orphan its check,
 * or the closed-world check (layer 2) rejects the registry before the
 * id-format invariant (layer 3) is ever reached, and the test would prove
 * the wrong control fired.
 */
export function renameRule(style: Json, from: string, to: string): void {
  for (const section of Object.values(style.grammar as Record<string, Json>)) {
    for (const bucket of ["rules", "prohibitions"] as const) {
      for (const rule of (section[bucket] as Json[] | undefined) ?? []) {
        if (rule.id === from) rule.id = to;
      }
    }
  }
  for (const check of (style.compliance as { checks: Json[] }).checks) {
    if (check.testsRule === from) check.testsRule = to;
  }
}
