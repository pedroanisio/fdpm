import { z } from "zod";

/* ============================================================================
 * FDPM Plugin Ideas Registry Schema
 * ========================================================================== */

/**
 * This schema defines a canonical machine-readable structure for a document like:
 *
 * "FDPM plugin ideas — 250 entries"
 *
 * The Markdown file becomes a rendered projection of this schema instance.
 */

/* ============================================================================
 * 1. Shared Scalars
 * ========================================================================== */

/**
 * Stable plugin identifier: a dotted, kebab-case namespace path.
 *
 * Shape: `<namespace>(.<segment>)+` where each segment is lowercase
 * alphanumeric kebab-case (numeric-leading segments allowed, e.g.
 * `fdpm.5-whys-template`). The first segment is the namespace
 * (`fdpm`, `customer-service`, etc.) and at least one trailing segment
 * is required.
 *
 * The schema does not lock the namespace to `fdpm` because the same
 * registry shape is used for parallel registries (customer-service
 * domain profiles, etc.). Namespace conventions are enforced at the
 * registry level, not at the id level.
 */
export const FdpmPluginIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/, {
    message:
      "Plugin id must follow <namespace>.<segment>(.<segment>)* kebab-case format, e.g. fdpm.api-contracts or customer-service.account.",
  })
  .describe("Stable plugin identifier; the source of truth for cross-references.");

/**
 * True capabilities — surfaces a plugin actually ships.
 * Used by PluginEntrySchema.capabilityKinds.
 */
export const CapabilityKindSchema = z
  .enum([
    "cap:profile",
    "cap:renderer",
    "cap:validator",
    "cap:transformer",
    "cap:importer",
    "cap:exporter",
    "cap:expr-helper",
    "cap:lifecycle-hook",
    "cap:template",
    "cap:asset",
  ])
  .describe("A capability surface a plugin can ship.");

/**
 * Section-level classification tags. These are not capabilities; they label
 * agent-shaped or catch-all sections of the registry.
 */
export const SectionClassificationSchema = z
  .enum(["verb", "prompt", "custom"])
  .describe("Non-capability classification tag used at the section level.");

/**
 * Per-entry kind discriminator. Distinguishes shippable plugins from
 * utility modules, barrels, demos, and pure data catalogues that the
 * registry may also enumerate. Defaults to "plugin" for backwards
 * compatibility with registries that pre-date this field.
 *
 * - "plugin"   — ships at least one cap:* surface; capabilityKinds required.
 * - "utility"  — internal helper module (types, error monad, etc.); no cap:*.
 * - "barrel"   — pure re-export module; no cap:*.
 * - "demo"     — runnable example / reference; no cap:*.
 * - "data"     — catalogue/dataset entry consumed by another plugin; no cap:*.
 */
export const EntryKindSchema = z
  .enum(["plugin", "utility", "barrel", "demo", "data"])
  .describe("Kind discriminator for a registry entry.");

/**
 * Union accepted at section-level for primaryCapabilityKinds, where both
 * true capabilities and classification tags are valid.
 */
export const SectionKindSchema = z.union([
  CapabilityKindSchema,
  SectionClassificationSchema,
]);

export const TierSchema = z
  .enum(["S", "A", "B", "C"])
  .describe("Priority tier — S highest, C lowest.");

export const DocumentStatusSchema = z.enum([
  "brainstorm",
  "draft",
  "review",
  "candidate",
  "approved",
  "deprecated",
]);

export const PositiveIntegerSchema = z.number().int().positive();

export const PercentageSchema = z.number().min(0).max(100);

/* ============================================================================
 * 2. Frontmatter / Metadata
 * ========================================================================== */

export const ProvenanceSchema = z.object({
  sourceRequest: z.string().min(1),
  baseline: z.string().min(1),

  capabilityKindsReferenced: z.object({
    count: z.number().int().nonnegative(),

    /**
     * Capability kinds and section classifications referenced by the
     * registry. Accepts the section-level union because the document
     * also enumerates verb/prompt surfaces.
     */
    kinds: z.array(SectionKindSchema).default([]),

    note: z.string().optional(),
  }),
});

export const PluginIdeasFrontmatterSchema = z.object({
  title: z.string().min(1),
  status: DocumentStatusSchema,
  disclaimer: z.string().min(1),
  provenance: ProvenanceSchema,
});

/* ============================================================================
 * 3. Preamble and Tier Calibration
 * ========================================================================== */

export const TierDefinitionSchema = z.object({
  tier: TierSchema,
  label: z.string().optional(),
  meaning: z.string().min(1),
});

/**
 * Tier distribution rows store only counts. Percentages are presentation
 * and must be derived at render time from count / totalEntries.
 */
export const TierDistributionRowSchema = z.object({
  tier: TierSchema,
  count: z.number().int().nonnegative(),
});

type TierDistributionRow = z.infer<typeof TierDistributionRowSchema>;

type TierDistributionInput = {
  totalEntries: number;
  rows: TierDistributionRow[];
};

export const TierDistributionSchema = z
  .object({
    totalEntries: z.number().int().positive(),
    rows: z.array(TierDistributionRowSchema).min(1),
  })
  .superRefine((distribution: TierDistributionInput, ctx: z.RefinementCtx) => {
    const countedTotal = distribution.rows.reduce(
      (sum: number, row: TierDistributionRow) => sum + row.count,
      0,
    );

    if (countedTotal !== distribution.totalEntries) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows"],
        message: `Tier counts sum to ${countedTotal}, expected ${distribution.totalEntries}.`,
      });
    }

    const seenTiers = new Set<string>();
    for (const [rowIndex, row] of distribution.rows.entries()) {
      if (seenTiers.has(row.tier)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", rowIndex, "tier"],
          message: `Tier ${row.tier} appears more than once in the distribution.`,
        });
      }
      seenTiers.add(row.tier);
    }
  });

export const BacklogRecommendationSchema = z.object({
  keepLiveTiers: z.array(TierSchema),
  parkingLotTiers: z.array(TierSchema),
  calibrationOnlyTiers: z.array(TierSchema),
  rationale: z.string().optional(),
});

export const HonestPreambleSchema = z.object({
  body: z.string().min(1),
  tierDefinitions: z.array(TierDefinitionSchema).length(TierSchema.options.length),
  tierDistribution: TierDistributionSchema,
  backlogRecommendation: BacklogRecommendationSchema.optional(),
  notes: z.array(z.string()).default([]),
});

/* ============================================================================
 * 4. Plugin Entries
 * ========================================================================== */

export const PluginEntrySchema = z.object({
  /**
   * The displayed number in the Markdown table.
   *
   * Important: the file has 250 entries but uses IDs up to 267 because of
   * numbering reconciliation. So displayNumber is not required to be dense.
   */
  displayNumber: PositiveIntegerSchema,

  id: FdpmPluginIdSchema,

  /**
   * Short "what" field from the Markdown table.
   */
  what: z.string().min(1),

  /**
   * Short "why" field from the Markdown table.
   */
  why: z.string().min(1),

  tier: TierSchema,

  /**
   * Entry kind. Defaults to "plugin" so older registries that pre-date this
   * field continue to validate. Non-plugin kinds (utility, barrel, demo,
   * data) are allowed to ship an empty capabilityKinds array; the
   * registry-level superRefine enforces capabilityKinds.length >= 1 only
   * when kind === "plugin".
   */
  kind: EntryKindSchema.default("plugin"),

  /**
   * Capabilities shipped or primarily exercised by this plugin.
   * True capabilities only — section-level classification tags
   * (verb / prompt / custom) live on PluginSectionSchema.
   *
   * For kind === "plugin" the registry-level superRefine requires at
   * least one entry; for other kinds an empty array is valid.
   */
  capabilityKinds: z.array(CapabilityKindSchema).default([]),

  /**
   * Cross-references to other plugins by stable id, not display number.
   * Display numbers are presentation; ids are identity. crossReferences
   * is an editorial signal ("see also"); for actual import/dependency
   * edges use the dependsOn field, which the validator treats as a
   * machine-checkable graph.
   */
  crossReferences: z.array(FdpmPluginIdSchema).default([]),

  /**
   * Hard dependencies on other registry entries — the import graph.
   * Validated against the same id set as crossReferences. Use this when
   * removing entry X would break entry Y; use crossReferences for purely
   * editorial "related to" links.
   */
  dependsOn: z.array(FdpmPluginIdSchema).default([]),

  /**
   * Optional comments for weak, duplicated, or deliberately low-tier entries.
   */
  notes: z.array(z.string()).default([]),
});

export type PluginEntry = z.infer<typeof PluginEntrySchema>;

/* ============================================================================
 * 5. Plugin Sections
 * ========================================================================== */

export const PluginSectionSchema = z.object({
  /**
   * Section ordering is established by array position. No separate
   * `order` field — that would be a redundant source of truth.
   */
  /**
   * Examples:
   * "Domain profiles"
   * "Renderers"
   * "Importers / Exporters"
   * "Validators / expr helpers"
   */
  title: z.string().min(1),

  /**
   * Section-level classification. Accepts both true capabilities
   * (cap:*) and non-capability tags (verb / prompt / custom).
   */
  primaryCapabilityKinds: z.array(SectionKindSchema).min(1),

  description: z.string().optional(),

  /**
   * Section entry count is derived from `entries.length`. If a human
   * audit count exists, store it in NumberingReconciliation.sectionCounts
   * where it is explicitly cross-checked.
   */
  entries: z.array(PluginEntrySchema).min(1),
});

export type PluginSection = z.infer<typeof PluginSectionSchema>;

/* ============================================================================
 * 6. Reconciliation / Count Audit
 * ========================================================================== */

export const SectionCountAuditRowSchema = z.object({
  sectionTitle: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const NumberingReconciliationSchema = z.object({
  note: z.string().min(1),

  /**
   * The file explicitly says IDs run 1–267 even though entry count is 250.
   */
  displayedNumberMin: PositiveIntegerSchema.optional(),
  displayedNumberMax: PositiveIntegerSchema.optional(),

  actualEntryCount: z.number().int().positive(),

  sectionCounts: z.array(SectionCountAuditRowSchema).min(1),
});

/* ============================================================================
 * 7. Deliberate Omissions
 * ========================================================================== */

export const DeliberateOmissionSchema = z.object({
  category: z.string().min(1),
  decision: z.enum(["excluded", "included_low_tier", "deferred"]),
  rationale: z.string().min(1),
  examples: z.array(z.string()).default([]),
});

export const DeliberateOmissionsSectionSchema = z.object({
  introduction: z.string().optional(),
  omissions: z.array(DeliberateOmissionSchema).default([]),
});

/* ============================================================================
 * 8. Maintainer Recommendation
 * ========================================================================== */

export const MaintainerActionSchema = z.object({
  /**
   * Action ordering is established by array position. No separate
   * `order` field — that would be a redundant source of truth.
   */
  action: z.string().min(1),
  rationale: z.string().optional(),
  targetTiers: z.array(TierSchema).default([]),
  targetCapabilities: z.array(CapabilityKindSchema).default([]),
});

export const MaintainerRecommendationSchema = z.object({
  body: z.string().optional(),
  actions: z.array(MaintainerActionSchema).default([]),

  /**
   * The file says the single highest-leverage action is a one-page plugin
   * contract conformance test.
   */
  highestLeverageAction: z
    .object({
      title: z.string().min(1),
      description: z.string().min(1),
    })
    .optional(),
});

/* ============================================================================
 * 9. Full Document Schema
 * ========================================================================== */

type RegistryDocument = {
  schemaVersion: "1.0.0";
  frontmatter: z.infer<typeof PluginIdeasFrontmatterSchema>;
  heading: string;
  honestPreamble: z.infer<typeof HonestPreambleSchema>;
  sections: z.infer<typeof PluginSectionSchema>[];
  numberingReconciliation?: z.infer<typeof NumberingReconciliationSchema>;
  deliberateOmissions?: z.infer<typeof DeliberateOmissionsSectionSchema>;
  maintainerRecommendation?: z.infer<typeof MaintainerRecommendationSchema>;
};

export const FdpmPluginIdeasRegistrySchema = z
  .object({
    /**
     * Required, not defaulted. A document with no version is malformed
     * and must fail validation rather than silently coerce to 1.0.0.
     */
    schemaVersion: z.literal("1.0.0"),

    frontmatter: PluginIdeasFrontmatterSchema,

    heading: z.string().min(1),

    honestPreamble: HonestPreambleSchema,

    sections: z.array(PluginSectionSchema).min(1),

    numberingReconciliation: NumberingReconciliationSchema.optional(),

    deliberateOmissions: DeliberateOmissionsSectionSchema.optional(),

    maintainerRecommendation: MaintainerRecommendationSchema.optional(),
  })
  .superRefine((document: RegistryDocument, ctx: z.RefinementCtx) => {
    const allEntries = document.sections.flatMap((section) => section.entries);

    /**
     * Build identity sets once at the top so every downstream check sees
     * the same view, regardless of refinement-block ordering.
     */
    const ids = new Set<string>();
    const displayNumbers = new Set<number>();

    for (const [entryIndex, entry] of allEntries.entries()) {
      if (ids.has(entry.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections"],
          message: `Duplicate plugin id '${entry.id}' near flattened entry index ${entryIndex}.`,
        });
      }
      ids.add(entry.id);

      if (displayNumbers.has(entry.displayNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections"],
          message: `Duplicate display number #${entry.displayNumber}.`,
        });
      }
      displayNumbers.add(entry.displayNumber);
    }

    /**
     * Tier distribution must match actual entries.
     */
    const actualTotal = allEntries.length;
    const declaredTotal = document.honestPreamble.tierDistribution.totalEntries;

    if (actualTotal !== declaredTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["honestPreamble", "tierDistribution", "totalEntries"],
        message: `Tier distribution declares ${declaredTotal} entries, actual document has ${actualTotal}.`,
      });
    }

    type TierKey = z.infer<typeof TierSchema>;
    const actualTierCounts = new Map<TierKey, number>([
      ["S", 0],
      ["A", 0],
      ["B", 0],
      ["C", 0],
    ]);

    for (const entry of allEntries) {
      actualTierCounts.set(entry.tier, (actualTierCounts.get(entry.tier) ?? 0) + 1);
    }

    for (const [rowIndex, row] of document.honestPreamble.tierDistribution.rows.entries()) {
      const observed = actualTierCounts.get(row.tier) ?? 0;
      if (observed !== row.count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["honestPreamble", "tierDistribution", "rows", rowIndex, "count"],
          message:
            `Tier ${row.tier} declares ${row.count}, ` +
            `but actual count is ${observed}.`,
        });
      }
    }

    /**
     * Reconciliation section: cross-check actualEntryCount, audited
     * section counts, and the displayed-number range bounds.
     */
    if (document.numberingReconciliation) {
      const reconciliation = document.numberingReconciliation;

      if (reconciliation.actualEntryCount !== actualTotal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["numberingReconciliation", "actualEntryCount"],
          message:
            `Reconciliation declares ${reconciliation.actualEntryCount}, ` +
            `actual entry count is ${actualTotal}.`,
        });
      }

      type SectionCountAuditRow = z.infer<typeof SectionCountAuditRowSchema>;
      const sectionCountMap = new Map<string, number>(
        reconciliation.sectionCounts.map(
          (row: SectionCountAuditRow): [string, number] => [
            row.sectionTitle,
            row.count,
          ],
        ),
      );

      for (const section of document.sections) {
        const auditedCount = sectionCountMap.get(section.title);

        if (auditedCount !== undefined && auditedCount !== section.entries.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["numberingReconciliation", "sectionCounts"],
            message:
              `Audit count for section '${section.title}' is ${auditedCount}, ` +
              `but actual count is ${section.entries.length}.`,
          });
        }
      }

      if (displayNumbers.size > 0) {
        const observedMin = Math.min(...displayNumbers);
        const observedMax = Math.max(...displayNumbers);

        if (
          reconciliation.displayedNumberMin !== undefined &&
          reconciliation.displayedNumberMin !== observedMin
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["numberingReconciliation", "displayedNumberMin"],
            message:
              `Reconciliation declares min display number ${reconciliation.displayedNumberMin}, ` +
              `actual min is ${observedMin}.`,
          });
        }

        if (
          reconciliation.displayedNumberMax !== undefined &&
          reconciliation.displayedNumberMax !== observedMax
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["numberingReconciliation", "displayedNumberMax"],
            message:
              `Reconciliation declares max display number ${reconciliation.displayedNumberMax}, ` +
              `actual max is ${observedMax}.`,
          });
        }
      }
    }

    /**
     * Cross-references must point to known plugin ids.
     */
    for (const entry of allEntries) {
      for (const ref of entry.crossReferences) {
        if (!ids.has(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections"],
            message:
              `Plugin '${entry.id}' references '${ref}', but no entry has that id.`,
          });
        }
      }

      /**
       * dependsOn edges must also resolve, and an entry cannot depend on itself.
       */
      for (const dep of entry.dependsOn) {
        if (dep === entry.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections"],
            message: `Entry '${entry.id}' lists itself in dependsOn.`,
          });
          continue;
        }
        if (!ids.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections"],
            message:
              `Entry '${entry.id}' depends on '${dep}', but no entry has that id.`,
          });
        }
      }

      /**
       * Plugin-kind entries must ship at least one capability surface.
       * Non-plugin kinds (utility, barrel, demo, data) are exempt because
       * they do not register any cap:* in FDPM.
       */
      if (entry.kind === "plugin" && entry.capabilityKinds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections"],
          message:
            `Entry '${entry.id}' has kind="plugin" but capabilityKinds is empty. ` +
            `Either add a cap:* surface or change kind to utility/barrel/demo/data.`,
        });
      }
    }
  });

export type FdpmPluginIdeasRegistry = z.infer<typeof FdpmPluginIdeasRegistrySchema>;
export type CapabilityKind = z.infer<typeof CapabilityKindSchema>;
export type SectionClassification = z.infer<typeof SectionClassificationSchema>;
export type SectionKind = z.infer<typeof SectionKindSchema>;
export type EntryKind = z.infer<typeof EntryKindSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;
export type FdpmPluginId = z.infer<typeof FdpmPluginIdSchema>;
export type PluginIdeasFrontmatter = z.infer<typeof PluginIdeasFrontmatterSchema>;
export type HonestPreamble = z.infer<typeof HonestPreambleSchema>;
export type NumberingReconciliation = z.infer<typeof NumberingReconciliationSchema>;
export type DeliberateOmissionsSection = z.infer<typeof DeliberateOmissionsSectionSchema>;
export type MaintainerRecommendation = z.infer<typeof MaintainerRecommendationSchema>;