#!/usr/bin/env python3
"""acad_validate.py — automated validation for FDPM academic-paper workbooks.

Runs two passes over a workbook registered to ``profile:academic-paper:0.4.1``
(the sole academic-paper profile since the v0.3 plugin was withdrawn on
2026-08-29; the ``acad:`` type prefixes below are unchanged by that move):

  1. Native profile validation, by shelling out to ``fdpm validate
     <workbook> --json``.
  2. Cross-primitive consistency checks the profile validator does not cover:

     - R-REF   Referential integrity of scalar id-references (every
               ``paper``/``section``/``concept``/``citedWork``/etc. resolves
               to a primitive in the workbook).
     - R-MIRROR Mirror-relation consistency: every scalar id-ref has a
               corresponding explicit relation row (e.g. ``Claim.paper``
               must coexist with a ``ClaimPaper`` relation row).
     - R-CITE  Citation completeness: every Citation has at least one
               citing context; every cited Work exists; warn on Works
               that are never cited.
     - R-EQDAG Equation derivation DAG: ``derivesFrom`` is acyclic; every
               ``role: derived | identity`` equation has at least one
               ``derivesFrom`` or ``fromPostulates``.
     - R-STREE Section parent tree: ``parent`` chain is acyclic and
               terminates at a root section; root sections have ``paper``.
     - R-CONCEPT Concept defined-or-borrowed, relation-aware: a Concept
               passes if it has a ``Definition`` primitive OR a
               ``ConceptBorrowsFrom`` relation; supplements the profile
               rule (which appears to check only the denormalised field).
     - R-COV   Coverage (informational): claims without Evidence,
               sections without content, Works without authors / DOI.

Output: a structured report (JSON or human-readable). Exit code reflects
the highest severity observed.

Usage:

    fdpm validate-acad <workbook_id>           # human-readable
    fdpm validate-acad <workbook_id> --json    # machine-readable JSON
    fdpm validate-acad <workbook_id> --strict  # warnings -> exit 2

This module is dependency-free (stdlib only); the only runtime
prerequisite is the ``fdpm`` binary on PATH.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Iterable

ACADEMIC_PAPER_PROFILE = "profile:academic-paper:0.4.1"

# ---------------------------------------------------------------------------
# Reference schema
# ---------------------------------------------------------------------------
# Maps primitive type -> list of (field_name, expected_target_type_prefix,
# is_list, mirror_relation_type or None). The mirror-relation column is the
# explicit relation type that, by workbook convention, should also exist for
# the same source-target pair. ``None`` means the field has no mirror.

# Helper: a "type prefix" like "acad:Paper" matches any primitive whose
# type_id is "acad:Paper". Field values use the slug-only form (e.g.
# "paper-foo"); we look up by ``field_values.id``.

_FieldRef = tuple[str, str, bool, str | None]


def _refs(*entries: _FieldRef) -> tuple[_FieldRef, ...]:
    return entries


REF_SCHEMA: dict[str, tuple[_FieldRef, ...]] = {
    "acad:Author": _refs(
        ("paper", "acad:Paper", False, "acad:AuthorPaper"),
        ("affiliations", "acad:Affiliation", True, "acad:AuthorAffiliations"),
    ),
    "acad:Section": _refs(
        ("paper", "acad:Paper", False, "acad:SectionPaper"),
        ("parent", "acad:Section", False, "acad:SectionParent"),
    ),
    "acad:Claim": _refs(
        ("paper", "acad:Paper", False, "acad:ClaimPaper"),
        ("section", "acad:Section", False, "acad:ClaimSection"),
        ("derivesFrom", "acad:Claim", True, "acad:ClaimDerivesFrom"),
        ("counterReads", "acad:Claim", True, "acad:ClaimCounterReads"),
        ("supersededBy", "acad:Claim", False, "acad:ClaimSupersededBy"),
    ),
    "acad:Evidence": _refs(
        ("paper", "acad:Paper", False, "acad:EvidencePaper"),
        ("supports", "acad:Claim", True, "acad:EvidenceSupports"),
        ("quotation", "acad:Quotation", False, "acad:EvidenceQuotation"),
        ("work", "acad:Work", False, "acad:EvidenceWork"),
    ),
    "acad:Quotation": _refs(
        ("paper", "acad:Paper", False, "acad:QuotationPaper"),
        ("section", "acad:Section", False, "acad:QuotationSection"),
        ("quotesFrom", "acad:Work", False, "acad:QuotationQuotesFrom"),
        ("translatedFrom", "acad:Quotation", False, "acad:QuotationTranslatedFrom"),
    ),
    "acad:Work": _refs(
        ("translationOf", "acad:Work", False, "acad:WorkTranslationOf"),
        ("editionOf", "acad:Work", False, "acad:WorkEditionOf"),
    ),
    "acad:Concept": _refs(
        ("borrowsFrom", "acad:Theorist", True, "acad:ConceptBorrowsFrom"),
        ("extends", "acad:Concept", True, "acad:ConceptExtends"),
    ),
    "acad:Definition": _refs(
        ("paper", "acad:Paper", False, "acad:DefinitionPaper"),
        ("concept", "acad:Concept", False, "acad:DefinitionConcept"),
        ("section", "acad:Section", False, "acad:DefinitionSection"),
        ("citedFrom", "acad:Work", False, "acad:DefinitionCitedFrom"),
    ),
    "acad:Theorist": _refs(
        ("notableTheories", "acad:Theory", True, "acad:TheoristNotableTheories"),
    ),
    "acad:Theory": _refs(
        ("primaryTheorist", "acad:Theorist", False, "acad:TheoryPrimaryTheorist"),
        ("extendsTheory", "acad:Theory", True, "acad:TheoryExtendsTheory"),
        ("respondsTo", "acad:Theory", True, "acad:TheoryRespondsTo"),
    ),
    "acad:Method": _refs(
        ("paper", "acad:Paper", False, "acad:MethodPaper"),
    ),
    "acad:Finding": _refs(
        ("paper", "acad:Paper", False, "acad:FindingPaper"),
        ("section", "acad:Section", False, "acad:FindingSection"),
        ("supportedBy", "acad:Evidence", True, "acad:FindingSupportedBy"),
        ("testsHypothesis", "acad:Claim", False, "acad:FindingTestsHypothesis"),
    ),
    "acad:Limitation": _refs(
        ("paper", "acad:Paper", False, "acad:LimitationPaper"),
    ),
    "acad:Footnote": _refs(
        ("paper", "acad:Paper", False, "acad:FootnotePaper"),
        ("section", "acad:Section", False, "acad:FootnoteSection"),
    ),
    "acad:Equation": _refs(
        ("paper", "acad:Paper", False, "acad:EquationPaper"),
        ("section", "acad:Section", False, "acad:EquationSection"),
        ("derivesFrom", "acad:Equation", True, "acad:EquationDerivesFrom"),
        ("fromPostulates", "acad:Claim", True, "acad:EquationFromPostulates"),
    ),
    "acad:Figure": _refs(
        ("paper", "acad:Paper", False, "acad:FigurePaper"),
        ("section", "acad:Section", False, "acad:FigureSection"),
    ),
    "acad:Citation": _refs(
        ("paper", "acad:Paper", False, "acad:CitationPaper"),
        ("citingClaim", "acad:Claim", False, "acad:CitationCitingClaim"),
        ("citingFinding", "acad:Finding", False, "acad:CitationCitingFinding"),
        ("citingSection", "acad:Section", False, "acad:CitationCitingSection"),
        ("citedWork", "acad:Work", False, "acad:CitationCitedWork"),
        ("citedQuotation", "acad:Quotation", False, "acad:CitationCitedQuotation"),
    ),
    "acad:Funding": _refs(
        ("paper", "acad:Paper", False, "acad:FundingPaper"),
        ("funder", "acad:Funder", False, "acad:FundingFunder"),
        ("recipients", "acad:Author", True, "acad:FundingRecipients"),
    ),
    "acad:Table": _refs(
        ("paper", "acad:Paper", False, "acad:TablePaper"),
        ("section", "acad:Section", False, "acad:TableSection"),
    ),
    "acad:PaperRelation": _refs(
        ("paper", "acad:Paper", False, "acad:PaperRelationPaper"),
        ("relatedWork", "acad:Work", False, "acad:PaperRelationRelatedWork"),
    ),
    "acad:Erratum": _refs(
        ("paper", "acad:Paper", False, "acad:ErratumPaper"),
        ("correctsSection", "acad:Section", False, "acad:ErratumCorrectsSection"),
        ("correctsClaim", "acad:Claim", False, "acad:ErratumCorrectsClaim"),
        ("correctsFinding", "acad:Finding", False, "acad:ErratumCorrectsFinding"),
        ("correctsEquation", "acad:Equation", False, "acad:ErratumCorrectsEquation"),
    ),
}


# ---------------------------------------------------------------------------
# fdpm CLI wrapper
# ---------------------------------------------------------------------------


class FdpmError(RuntimeError):
    """Raised when an fdpm invocation fails in an unexpected way."""


class FdpmClient:
    """Thin subprocess wrapper around the ``fdpm`` binary.

    Each method runs a one-shot ``fdpm <subcommand> ... --json`` invocation
    and parses the stdout JSON. ``fdpm validate`` is exposed as a separate
    call because it returns a non-zero exit code on validation failure
    (which is not an error from this script's perspective).
    """

    def __init__(self, fdpm: str = "fdpm", data_dir: str | None = None) -> None:
        self.fdpm = fdpm
        self.data_dir = data_dir

    def _run(self, *args: str, allow_failure: bool = False) -> Any:
        cmd: list[str] = [self.fdpm]
        if self.data_dir:
            cmd += ["--data-dir", self.data_dir]
        cmd += list(args) + ["--json"]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0 and not allow_failure:
            raise FdpmError(
                f"fdpm {' '.join(args)} -> exit {proc.returncode}: "
                f"{proc.stderr.strip()}"
            )
        body = proc.stdout.strip()
        if not body:
            return None
        return json.loads(body)

    def workbook_get(self, workbook_id: str) -> dict[str, Any]:
        payload = self._run("workbook", "get", workbook_id)
        return payload.get("workbook", payload)

    def primitive_list(self, workbook_id: str) -> list[dict[str, Any]]:
        payload = self._run("primitive", "list", workbook_id)
        if isinstance(payload, dict):
            return payload.get("primitives", [])
        return payload or []

    def relation_list(self, workbook_id: str) -> list[dict[str, Any]]:
        payload = self._run("relation", "list", workbook_id)
        if isinstance(payload, dict):
            return payload.get("relations", [])
        return payload or []

    def validate_native(self, workbook_id: str) -> dict[str, Any]:
        return self._run("validate", workbook_id, allow_failure=True) or {}


# ---------------------------------------------------------------------------
# Workbook model
# ---------------------------------------------------------------------------


@dataclass
class Workbook:
    id: str
    revision: int
    profile_id: str
    primitives: list[dict[str, Any]]
    relations: list[dict[str, Any]]

    @property
    def primitives_by_field_id(self) -> dict[str, dict[str, Any]]:
        """Index by ``field_values.id`` (the slug form used in ref fields)."""
        out: dict[str, dict[str, Any]] = {}
        for p in self.primitives:
            fid = p.get("field_values", {}).get("id")
            if fid:
                out[fid] = p
        return out

    @property
    def primitives_by_full_id(self) -> dict[str, dict[str, Any]]:
        """Index by ``id`` (the namespaced form, e.g. ``acad:Claim:foo``)."""
        return {p["id"]: p for p in self.primitives}

    @property
    def primitives_by_type(self) -> dict[str, list[dict[str, Any]]]:
        out: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for p in self.primitives:
            out[p["type_id"]].append(p)
        return out

    @property
    def relations_by_type(self) -> dict[str, list[dict[str, Any]]]:
        out: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in self.relations:
            out[r["type_id"]].append(r)
        return out

    def has_relation(self, type_id: str, source_id: str, target_id: str) -> bool:
        for r in self.relations_by_type.get(type_id, ()):
            if r["source_id"] == source_id and r["target_id"] == target_id:
                return True
        return False


def load_workbook(client: FdpmClient, workbook_id: str) -> Workbook:
    meta = client.workbook_get(workbook_id)
    return Workbook(
        id=meta["id"],
        revision=meta["revision"],
        profile_id=meta["profile_id"],
        primitives=client.primitive_list(workbook_id),
        relations=client.relation_list(workbook_id),
    )


# ---------------------------------------------------------------------------
# Finding model
# ---------------------------------------------------------------------------


LEVELS = ("info", "warning", "error")
LEVEL_RANK = {level: rank for rank, level in enumerate(LEVELS)}


@dataclass(frozen=True)
class Finding:
    rule_id: str
    level: str
    target_id: str | None
    message: str
    source: str = "acad_validate"

    def __post_init__(self) -> None:
        if self.level not in LEVEL_RANK:
            raise ValueError(f"invalid finding level: {self.level!r}")


# ---------------------------------------------------------------------------
# Validation rules
# ---------------------------------------------------------------------------


def _iter_field_refs(
    primitive: dict[str, Any],
) -> Iterable[tuple[str, str, str, bool]]:
    """Yield ``(field_name, expected_type, slug, is_list)`` for every
    id-reference field present in the primitive's ``field_values``."""
    type_id = primitive["type_id"]
    schema = REF_SCHEMA.get(type_id, ())
    fv = primitive.get("field_values", {})
    for field_name, expected_type, is_list, _mirror in schema:
        if field_name not in fv:
            continue
        value = fv[field_name]
        if is_list:
            if not isinstance(value, list):
                continue
            for item in value:
                if isinstance(item, str) and item:
                    yield field_name, expected_type, item, True
        else:
            if isinstance(value, str) and value:
                yield field_name, expected_type, value, False


def check_referential_integrity(wb: Workbook) -> list[Finding]:
    """R-REF: every scalar id-ref in ``field_values`` resolves."""
    findings: list[Finding] = []
    index = wb.primitives_by_field_id
    for prim in wb.primitives:
        type_id = prim["type_id"]
        prim_id = prim["id"]
        for field_name, expected_type, slug, is_list in _iter_field_refs(prim):
            target = index.get(slug)
            if target is None:
                findings.append(
                    Finding(
                        rule_id="acad.ref.dangling",
                        level="error",
                        target_id=prim_id,
                        message=(
                            f"{type_id} {prim_id}.{field_name} -> {slug!r} "
                            f"(expected {expected_type}) does not resolve to a "
                            f"primitive in this workbook"
                        ),
                    )
                )
                continue
            if not target["type_id"].startswith(expected_type):
                findings.append(
                    Finding(
                        rule_id="acad.ref.type-mismatch",
                        level="error",
                        target_id=prim_id,
                        message=(
                            f"{type_id} {prim_id}.{field_name} -> {slug!r} "
                            f"resolves to {target['type_id']}, expected "
                            f"{expected_type}"
                        ),
                    )
                )
    return findings


def check_mirror_relations(wb: Workbook) -> list[Finding]:
    """R-MIRROR: every scalar id-ref has a matching explicit relation row."""
    findings: list[Finding] = []
    field_index = wb.primitives_by_field_id
    for prim in wb.primitives:
        type_id = prim["type_id"]
        prim_id = prim["id"]
        fv = prim.get("field_values", {})
        for field_name, expected_type, is_list, mirror_type in REF_SCHEMA.get(
            type_id, ()
        ):
            if mirror_type is None or field_name not in fv:
                continue
            values = fv[field_name] if is_list else [fv[field_name]]
            if not is_list and not isinstance(fv[field_name], str):
                continue
            for slug in values:
                if not isinstance(slug, str) or not slug:
                    continue
                target = field_index.get(slug)
                if target is None:
                    # dangling refs already reported by R-REF
                    continue
                if not wb.has_relation(mirror_type, prim_id, target["id"]):
                    findings.append(
                        Finding(
                            rule_id="acad.mirror.missing-relation",
                            level="warning",
                            target_id=prim_id,
                            message=(
                                f"{type_id} {prim_id} has field "
                                f"{field_name}={slug!r} but no {mirror_type} "
                                f"relation row to {target['id']}"
                            ),
                        )
                    )
    return findings


def check_citations(wb: Workbook) -> list[Finding]:
    """R-CITE: citation completeness + dead/uncited works."""
    findings: list[Finding] = []
    cited_work_slugs: set[str] = set()
    for cit in wb.primitives_by_type.get("acad:Citation", []):
        cit_id = cit["id"]
        fv = cit.get("field_values", {})
        contexts = [fv.get(k) for k in ("citingClaim", "citingFinding", "citingSection")]
        if not any(contexts):
            findings.append(
                Finding(
                    rule_id="acad.citation.no-context",
                    level="warning",
                    target_id=cit_id,
                    message=(
                        f"Citation {cit_id} has no citingClaim, citingFinding, "
                        f"or citingSection — citation context is ambiguous"
                    ),
                )
            )
        cited_work = fv.get("citedWork")
        if isinstance(cited_work, str) and cited_work:
            cited_work_slugs.add(cited_work)

    works = wb.primitives_by_type.get("acad:Work", [])
    for work in works:
        slug = work.get("field_values", {}).get("id", "")
        if slug and slug not in cited_work_slugs:
            findings.append(
                Finding(
                    rule_id="acad.work.uncited",
                    level="info",
                    target_id=work["id"],
                    message=(
                        f"Work {work['id']} is never cited by any Citation "
                        f"primitive (dead reference)"
                    ),
                )
            )
    return findings


def check_equation_dag(wb: Workbook) -> list[Finding]:
    """R-EQDAG: derivesFrom forms a DAG; derived/identity equations have
    at least one derivesFrom or fromPostulates."""
    findings: list[Finding] = []
    eqs = wb.primitives_by_type.get("acad:Equation", [])
    by_slug: dict[str, dict[str, Any]] = {
        e["field_values"]["id"]: e for e in eqs if e.get("field_values", {}).get("id")
    }
    adj: dict[str, list[str]] = defaultdict(list)
    for eq in eqs:
        slug = eq.get("field_values", {}).get("id")
        if not slug:
            continue
        for target in eq.get("field_values", {}).get("derivesFrom", []) or []:
            if isinstance(target, str) and target in by_slug:
                adj[slug].append(target)

    visited: dict[str, int] = {}  # 0=unseen, 1=on-stack, 2=done

    def dfs(node: str, stack: list[str]) -> str | None:
        state = visited.get(node, 0)
        if state == 1:
            cycle_start = stack.index(node)
            return " -> ".join(stack[cycle_start:] + [node])
        if state == 2:
            return None
        visited[node] = 1
        stack.append(node)
        for nxt in adj.get(node, ()):
            cycle = dfs(nxt, stack)
            if cycle is not None:
                return cycle
        stack.pop()
        visited[node] = 2
        return None

    for slug in by_slug:
        cycle = dfs(slug, [])
        if cycle is not None:
            findings.append(
                Finding(
                    rule_id="acad.equation.cycle",
                    level="error",
                    target_id=f"acad:Equation:{slug}",
                    message=f"derivesFrom cycle detected: {cycle}",
                )
            )
            break  # one cycle finding is enough

    for eq in eqs:
        fv = eq.get("field_values", {})
        role = fv.get("role")
        if role in {"derived", "identity"}:
            df = fv.get("derivesFrom") or []
            fp = fv.get("fromPostulates") or []
            if not df and not fp:
                findings.append(
                    Finding(
                        rule_id="acad.equation.derived-no-source",
                        level="warning",
                        target_id=eq["id"],
                        message=(
                            f"Equation {eq['id']} has role={role!r} but neither "
                            f"derivesFrom nor fromPostulates is populated"
                        ),
                    )
                )
    return findings


def check_section_tree(wb: Workbook) -> list[Finding]:
    """R-STREE: SectionParent is acyclic; root sections have a paper."""
    findings: list[Finding] = []
    sections = wb.primitives_by_type.get("acad:Section", [])
    by_slug = {
        s["field_values"]["id"]: s
        for s in sections
        if s.get("field_values", {}).get("id")
    }
    parent_of: dict[str, str | None] = {}
    for s in sections:
        fv = s.get("field_values", {})
        slug = fv.get("id")
        if not slug:
            continue
        parent_of[slug] = fv.get("parent")
        if parent_of[slug] is None and not fv.get("paper"):
            findings.append(
                Finding(
                    rule_id="acad.section.orphan-root",
                    level="error",
                    target_id=s["id"],
                    message=(
                        f"Root section {s['id']} has no parent and no paper "
                        f"field"
                    ),
                )
            )
    # cycle detection on parent chain
    for slug in parent_of:
        seen = []
        cur: str | None = slug
        while cur is not None:
            if cur in seen:
                cycle = " -> ".join(seen[seen.index(cur):] + [cur])
                findings.append(
                    Finding(
                        rule_id="acad.section.parent-cycle",
                        level="error",
                        target_id=f"acad:Section:{slug}",
                        message=f"section parent cycle: {cycle}",
                    )
                )
                break
            seen.append(cur)
            if cur not in parent_of:
                # parent ref to non-existent section: caught by R-REF
                break
            cur = parent_of.get(cur)
    return findings


def check_concepts_defined_or_borrowed(wb: Workbook) -> list[Finding]:
    """R-CONCEPT: every Concept must have a Definition (in this paper) or a
    ConceptBorrowsFrom relation to at least one Theorist. Relation-aware
    version of the profile rule."""
    findings: list[Finding] = []
    concepts = wb.primitives_by_type.get("acad:Concept", [])
    defs = wb.primitives_by_type.get("acad:Definition", [])
    borrows = wb.relations_by_type.get("acad:ConceptBorrowsFrom", [])

    defined_concept_slugs: set[str] = set()
    for d in defs:
        concept_slug = d.get("field_values", {}).get("concept")
        if isinstance(concept_slug, str):
            defined_concept_slugs.add(concept_slug)

    borrowing_concept_ids: set[str] = set()
    for b in borrows:
        borrowing_concept_ids.add(b["source_id"])

    for c in concepts:
        slug = c.get("field_values", {}).get("id", "")
        full = c["id"]
        if slug in defined_concept_slugs:
            continue
        if full in borrowing_concept_ids:
            continue
        findings.append(
            Finding(
                rule_id="acad.concept.defined-or-borrowed",
                level="error",
                target_id=full,
                message=(
                    f"Concept {full} has neither a Definition nor a "
                    f"ConceptBorrowsFrom relation to a Theorist"
                ),
            )
        )
    return findings


def check_coverage(wb: Workbook) -> list[Finding]:
    """R-COV: informational coverage gaps."""
    findings: list[Finding] = []
    claims = wb.primitives_by_type.get("acad:Claim", [])
    evidence = wb.primitives_by_type.get("acad:Evidence", [])
    citations = wb.primitives_by_type.get("acad:Citation", [])
    works = wb.primitives_by_type.get("acad:Work", [])

    supported_claim_slugs: set[str] = set()
    for ev in evidence:
        for s in ev.get("field_values", {}).get("supports", []) or []:
            if isinstance(s, str):
                supported_claim_slugs.add(s)

    cited_claim_slugs: set[str] = set()
    for cit in citations:
        cs = cit.get("field_values", {}).get("citingClaim")
        if isinstance(cs, str):
            cited_claim_slugs.add(cs)

    for c in claims:
        slug = c.get("field_values", {}).get("id", "")
        kind = c.get("field_values", {}).get("kind")
        if kind in {"hypothesis", "empirical"} and slug not in supported_claim_slugs:
            findings.append(
                Finding(
                    rule_id="acad.claim.no-evidence",
                    level="info",
                    target_id=c["id"],
                    message=(
                        f"Claim {c['id']} (kind={kind!r}) has no supporting "
                        f"Evidence primitive"
                    ),
                )
            )

    for w in works:
        fv = w.get("field_values", {})
        authors = fv.get("authorsFreeText") or []
        if not authors:
            findings.append(
                Finding(
                    rule_id="acad.work.no-authors",
                    level="info",
                    target_id=w["id"],
                    message=f"Work {w['id']} has empty authorsFreeText",
                )
            )
        if not (fv.get("doi") or fv.get("isbn") or fv.get("url")):
            findings.append(
                Finding(
                    rule_id="acad.work.no-identifier",
                    level="info",
                    target_id=w["id"],
                    message=(
                        f"Work {w['id']} has no DOI, ISBN, or URL — "
                        f"resolution will rely on free-text matching"
                    ),
                )
            )

    return findings


def collect_native_findings(payload: dict[str, Any]) -> list[Finding]:
    """Convert ``fdpm validate --json`` payload into Finding records."""
    out: list[Finding] = []
    for bucket in ("primitives", "relations"):
        for entry in payload.get(bucket, []) or []:
            if entry.get("accepted", True):
                continue
            for f in entry.get("findings", []) or []:
                out.append(
                    Finding(
                        rule_id=f.get("rule_id", "fdpm-native:unknown"),
                        level=f.get("level", "error"),
                        target_id=f.get("target_id") or entry.get("target_id"),
                        message=f.get("message", ""),
                        source="fdpm-native",
                    )
                )
    return out


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


ALL_RULES: tuple[
    tuple[str, str, "callable[[Workbook], list[Finding]]"], ...  # type: ignore[name-defined]
] = (
    ("R-REF", "Referential integrity", check_referential_integrity),
    ("R-MIRROR", "Mirror-relation consistency", check_mirror_relations),
    ("R-CITE", "Citation completeness", check_citations),
    ("R-EQDAG", "Equation derivation DAG", check_equation_dag),
    ("R-STREE", "Section parent tree", check_section_tree),
    ("R-CONCEPT", "Concept defined-or-borrowed", check_concepts_defined_or_borrowed),
    ("R-COV", "Coverage", check_coverage),
)


def run_validation(
    client: FdpmClient,
    workbook_id: str,
    *,
    skip_native: bool = False,
) -> tuple[Workbook, list[Finding]]:
    wb = load_workbook(client, workbook_id)
    if wb.profile_id != ACADEMIC_PAPER_PROFILE:
        raise FdpmError(
            f"workbook {workbook_id!r} is on profile {wb.profile_id!r}, "
            f"expected {ACADEMIC_PAPER_PROFILE!r}"
        )
    findings: list[Finding] = []
    if not skip_native:
        findings.extend(collect_native_findings(client.validate_native(workbook_id)))
    for _key, _name, fn in ALL_RULES:
        findings.extend(fn(wb))
    return wb, findings


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def render_human(wb: Workbook, findings: list[Finding]) -> str:
    counts: dict[str, int] = defaultdict(int)
    by_rule: dict[str, list[Finding]] = defaultdict(list)
    for f in findings:
        counts[f.level] += 1
        by_rule[f.rule_id].append(f)

    lines: list[str] = []
    lines.append(f"workbook  : {wb.id}")
    lines.append(f"profile   : {wb.profile_id}")
    lines.append(f"revision  : {wb.revision}")
    lines.append(
        f"counts    : {len(wb.primitives)} primitives, "
        f"{len(wb.relations)} relations"
    )
    lines.append("")
    lines.append(
        "findings  : "
        f"errors={counts['error']} warnings={counts['warning']} "
        f"info={counts['info']}"
    )
    lines.append("")
    if not findings:
        lines.append("OK — no findings.")
        return "\n".join(lines)
    for rule_id in sorted(by_rule):
        bucket = by_rule[rule_id]
        levels = ",".join(sorted({f.level for f in bucket}))
        lines.append(f"  [{rule_id}] {len(bucket)} ({levels})")
        for f in bucket[:8]:
            lines.append(f"    - {f.level.upper():7} {f.target_id or '-'}: {f.message}")
        if len(bucket) > 8:
            lines.append(f"    ... and {len(bucket) - 8} more")
    return "\n".join(lines)


def render_json(wb: Workbook, findings: list[Finding]) -> str:
    counts: dict[str, int] = defaultdict(int)
    for f in findings:
        counts[f.level] += 1
    body = {
        "workbook_id": wb.id,
        "profile_id": wb.profile_id,
        "revision": wb.revision,
        "primitive_count": len(wb.primitives),
        "relation_count": len(wb.relations),
        "summary": {
            "errors": counts["error"],
            "warnings": counts["warning"],
            "info": counts["info"],
        },
        "findings": [
            {
                "rule_id": f.rule_id,
                "level": f.level,
                "target_id": f.target_id,
                "message": f.message,
                "source": f.source,
            }
            for f in findings
        ],
    }
    return json.dumps(body, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="acad_validate",
        description=__doc__.splitlines()[0] if __doc__ else None,
    )
    p.add_argument("workbook_id", help="FDPM workbook id")
    p.add_argument(
        "--json", action="store_true", help="emit machine-readable JSON report"
    )
    p.add_argument(
        "--skip-native",
        action="store_true",
        help="skip the native `fdpm validate` pass (run only acad checks)",
    )
    p.add_argument(
        "--strict",
        action="store_true",
        help="treat warnings as errors when computing exit code",
    )
    p.add_argument(
        "--data-dir",
        default=None,
        help="override FDPM_DATA_DIR for the underlying fdpm invocations",
    )
    p.add_argument(
        "--fdpm",
        default="fdpm",
        help="path to the fdpm binary (default: 'fdpm' on PATH)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    client = FdpmClient(fdpm=args.fdpm, data_dir=args.data_dir)
    try:
        wb, findings = run_validation(
            client, args.workbook_id, skip_native=args.skip_native
        )
    except FdpmError as e:
        print(f"error: {e}", file=sys.stderr)
        return 3

    out = render_json(wb, findings) if args.json else render_human(wb, findings)
    print(out)

    counts: dict[str, int] = defaultdict(int)
    for f in findings:
        counts[f.level] += 1
    if counts["error"] > 0:
        return 2
    if args.strict and counts["warning"] > 0:
        return 2
    if counts["warning"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
