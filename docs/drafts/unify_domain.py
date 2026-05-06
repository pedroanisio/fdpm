#!/usr/bin/env python3
"""Unify the 4 registries in plugin-instances.json into one flat domain.

Output schema (Option B):
  {
    "schemaVersion": "1.0.0",
    "generatedAt": "<ISO-8601 UTC>",
    "sourceFile": "plugin-instances.json",
    "sourceFilePath": "<relative path to staging file>",
    "sourceFingerprint": {
      "<registry slug>": {
        "path": "<relative .ts source path>",
        "sha256": "<hex digest>"
      },
      ...,
      "_staging": { "path": "plugin-instances.json", "sha256": "<hex digest>" }
    },
    "registriesIndex": [
      {
        "slug": ...,
        "title": ...,
        "totalEntries": ...,
        "sections": [
          { "title": ..., "primaryCapabilityKinds": [...], "entries": <int> }
        ],
        "tierBreakdown": { "S": int, "A": int, "B": int, "C": int }
      }
    ],
    "totalEntries": <int>,
    "tierBreakdown": { "S": int, "A": int, "B": int, "C": int },
    "kindBreakdown": { "plugin": int, ... },
    "entries": [
      {
        "displayNumber": <global 1..N>,
        "id": "<original id>",
        "what": ..., "why": ..., "tier": ...,
        "kind": "<plugin|utility|barrel|demo|data>",
        "capabilityKinds": [...],
        "crossReferences": [...],
        "dependsOn": [...],
        "notes": [...],
        "sourceRegistry": "<slug>",
        "sourceSection": "<sectionTitle>",
        "originalDisplayNumber": <number from source>
      },
      ...
    ]
  }

Provenance is preserved on every entry; original `id`s are unique
(verified pre-flight) so they pass through unchanged.

Fixes vs prior revision:
  1. sectionTitle key bug: source uses `title`, not `sectionTitle`.
     Pre-flight aborts if neither key carries a non-empty section title.
  2. Pass through `kind` (default "plugin") and `dependsOn` (default [])
     from source entries; both fields are part of the schema after the
     EntryKindSchema/dependsOn additions in plugins.ts.
  3. Add `sourceFingerprint` keyed by registry slug → sha256 of the
     source .ts instance file, plus the staging json itself, so
     consumers can detect staleness.
  4. `registriesIndex.sections` is now an array of section objects with
     {title, primaryCapabilityKinds, entries}, not a parallel string array.
  5. Add per-registry `tierBreakdown` plus corpus-level `tierBreakdown`
     and `kindBreakdown` so consumers can see tier discipline per source
     instead of only the (likely inflated) corpus rollup.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_SRC = HERE / "plugin-instances.json"
DEFAULT_DST = HERE / "plugin-instances.unified.json"

# Maps each registry slug to its authoritative TypeScript source file.
# The unifier fingerprints these so consumers can detect when the
# unified JSON is stale relative to a source instance.
SLUG_TO_SOURCE_TS: dict[str, str] = {
    "fdpm-250": "plugins.instance.ts",
    "fdpm-plugins": "fdpm-plugins-instance.ts",
    "customer-service-250": "customer-service.instance.ts",
    "executive-domain-500": "executive-domain-plugin-ideas-500.instance.ts",
}

# Schema defaults for fields that may be omitted on legacy entries.
# Mirror the defaults declared in plugins.ts so the unified JSON makes
# the discriminator universal across registries.
DEFAULT_KIND = "plugin"
DEFAULT_DEPENDS_ON: list[str] = []
TIERS = ("S", "A", "B", "C")


def sha256_of(path: Path) -> str:
    """Return the hex SHA-256 of `path`'s bytes, or '' if missing."""
    if not path.exists():
        return ""
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def empty_tier_counter() -> dict[str, int]:
    return {t: 0 for t in TIERS}


def main(argv: list[str]) -> int:
    args = argv[1:]
    src = Path(args[0]) if len(args) > 0 else DEFAULT_SRC
    dst = Path(args[1]) if len(args) > 1 else DEFAULT_DST

    data = json.loads(src.read_text())

    # Pre-flight 1: confirm ids are globally unique.
    seen_ids: Counter = Counter()
    for reg in data["registries"]:
        for section in reg["registry"]["sections"]:
            for entry in section["entries"]:
                seen_ids[entry["id"]] += 1
    collisions = {k: v for k, v in seen_ids.items() if v > 1}
    if collisions:
        print(f"ABORT: {len(collisions)} cross-registry id collision(s):", file=sys.stderr)
        for k, v in list(collisions.items())[:10]:
            print(f"  {k} x{v}", file=sys.stderr)
        return 2

    # Pre-flight 2: confirm at least one section in each registry has a
    # non-empty title under either `title` or legacy `sectionTitle`. If
    # both are empty we abort rather than silently produce another
    # everything-is-empty-string artefact.
    bad_section_keys: list[str] = []
    for reg in data["registries"]:
        for section in reg["registry"]["sections"]:
            stitle = section.get("title") or section.get("sectionTitle") or ""
            if not stitle:
                bad_section_keys.append(reg["slug"])
                break
    if bad_section_keys:
        print(
            f"ABORT: {len(bad_section_keys)} registry(ies) have at least one untitled section: "
            f"{bad_section_keys}",
            file=sys.stderr,
        )
        return 3

    # Pre-flight 3: every slug has a known source-ts mapping.
    unknown_slugs = [r["slug"] for r in data["registries"] if r["slug"] not in SLUG_TO_SOURCE_TS]
    if unknown_slugs:
        print(
            f"ABORT: registry slug(s) without a SLUG_TO_SOURCE_TS mapping: {unknown_slugs}",
            file=sys.stderr,
        )
        return 4

    unified_entries: list[dict] = []
    registries_index: list[dict] = []
    corpus_tier_counter: dict[str, int] = empty_tier_counter()
    corpus_kind_counter: Counter = Counter()

    global_counter = 0
    for reg in data["registries"]:
        slug = reg["slug"]
        title = reg.get("title") or reg["registry"]["frontmatter"].get("title")

        section_records: list[dict] = []
        reg_total = 0
        reg_tier_counter: dict[str, int] = empty_tier_counter()

        for section in reg["registry"]["sections"]:
            stitle = section.get("title") or section.get("sectionTitle") or ""
            primary_caps = section.get("primaryCapabilityKinds") or []

            section_entry_count = 0
            for entry in section["entries"]:
                global_counter += 1
                reg_total += 1
                section_entry_count += 1

                entry_kind = entry.get("kind") or DEFAULT_KIND
                entry_tier = entry.get("tier")
                if entry_tier in reg_tier_counter:
                    reg_tier_counter[entry_tier] += 1
                    corpus_tier_counter[entry_tier] += 1
                corpus_kind_counter[entry_kind] += 1

                unified_entries.append({
                    "displayNumber": global_counter,
                    "id": entry["id"],
                    "what": entry.get("what"),
                    "why": entry.get("why"),
                    "tier": entry_tier,
                    "kind": entry_kind,
                    "capabilityKinds": entry.get("capabilityKinds", []),
                    "crossReferences": entry.get("crossReferences", []),
                    "dependsOn": entry.get("dependsOn", list(DEFAULT_DEPENDS_ON)),
                    "notes": entry.get("notes", []),
                    "sourceRegistry": slug,
                    "sourceSection": stitle,
                    "originalDisplayNumber": entry.get("displayNumber"),
                })

            section_records.append({
                "title": stitle,
                "primaryCapabilityKinds": primary_caps,
                "entries": section_entry_count,
            })

        registries_index.append({
            "slug": slug,
            "title": title,
            "totalEntries": reg_total,
            "sections": section_records,
            "tierBreakdown": reg_tier_counter,
        })

    # Source fingerprints: per-registry source .ts plus the staging JSON itself.
    fingerprints: dict[str, dict[str, str]] = {}
    for slug, ts_filename in SLUG_TO_SOURCE_TS.items():
        ts_path = HERE / ts_filename
        fingerprints[slug] = {
            "path": ts_filename,
            "sha256": sha256_of(ts_path),
        }
    fingerprints["_staging"] = {
        "path": src.name,
        "sha256": sha256_of(src),
    }

    unified = {
        "schemaVersion": "1.0.0",
        "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "sourceFile": src.name,
        "sourceFilePath": str(src.relative_to(HERE.parent.parent)) if HERE.parent.parent in src.parents else str(src),
        "sourceFingerprint": fingerprints,
        "registriesIndex": registries_index,
        "totalEntries": len(unified_entries),
        "tierBreakdown": corpus_tier_counter,
        "kindBreakdown": dict(corpus_kind_counter),
        "entries": unified_entries,
    }

    dst.write_text(json.dumps(unified, indent=2, ensure_ascii=False) + "\n")

    # Post-flight checks
    ids_after = [e["id"] for e in unified_entries]
    dn_after = [e["displayNumber"] for e in unified_entries]
    assert len(set(ids_after)) == len(ids_after), "id duplication after merge"
    assert dn_after == list(range(1, len(unified_entries) + 1)), "displayNumber not contiguous 1..N"
    assert all(e["sourceSection"] for e in unified_entries), \
        "post-flight: at least one entry lost its section title; check section.get('title')"

    print(f"# wrote {dst}")
    print(f"  total entries:   {len(unified_entries)}")
    print(f"  unique ids:      {len(set(ids_after))}")
    print(f"  displayNumber:   1..{len(unified_entries)} (contiguous)")
    print(f"  size:            {dst.stat().st_size:,} bytes")
    print(f"  sourceSection:   {sum(1 for e in unified_entries if e['sourceSection'])}/{len(unified_entries)} populated")
    print()
    print("# corpus tier breakdown")
    for t in TIERS:
        n = corpus_tier_counter[t]
        pct = 100.0 * n / len(unified_entries) if unified_entries else 0
        print(f"  {t}: {n:>4} ({pct:5.1f}%)")
    print()
    print("# corpus kind breakdown")
    for k, n in sorted(corpus_kind_counter.items(), key=lambda kv: -kv[1]):
        pct = 100.0 * n / len(unified_entries) if unified_entries else 0
        print(f"  {k:<10} {n:>4} ({pct:5.1f}%)")
    print()
    print("# per-registry breakdown (totalEntries, tier S/A/B/C)")
    for r in registries_index:
        tb = r["tierBreakdown"]
        sec_n = len(r["sections"])
        sec_label = "section" if sec_n == 1 else "sections"
        print(
            f"  {r['slug']:<25} {r['totalEntries']:>4}  "
            f"S={tb['S']:>3} A={tb['A']:>3} B={tb['B']:>3} C={tb['C']:>3}  "
            f"({sec_n} {sec_label})"
        )
    print()
    print("# source fingerprints (truncated)")
    for slug, fp in fingerprints.items():
        digest = fp["sha256"][:16] if fp["sha256"] else "<missing>"
        print(f"  {slug:<25} {fp['path']:<48} sha256:{digest}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
