"""Tests for acad_validate.

Run with:
    uv run --with pytest pytest test_acad_validate.py
"""
from __future__ import annotations

import pytest

from acad_validate import (
    Finding,
    Workbook,
    check_concepts_defined_or_borrowed,
    check_equation_dag,
    check_mirror_relations,
    check_referential_integrity,
    check_section_tree,
    check_citations,
    collect_native_findings,
    render_human,
    render_json,
    run_validation,
)


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------


def _prim(full_id: str, type_id: str, **field_values) -> dict:
    if "id" not in field_values:
        field_values["id"] = full_id.split(":", 2)[2]
    return {"id": full_id, "type_id": type_id, "field_values": field_values}


def _rel(full_id: str, type_id: str, source_id: str, target_id: str) -> dict:
    return {
        "id": full_id,
        "type_id": type_id,
        "source_id": source_id,
        "target_id": target_id,
        "field_values": {},
    }


def _wb(primitives: list[dict], relations: list[dict] | None = None) -> Workbook:
    return Workbook(
        id="test-wb",
        revision=1,
        profile_id="profile:academic-paper:0.4.1",
        primitives=primitives,
        relations=relations or [],
    )


# ---------------------------------------------------------------------------
# R-REF: referential integrity
# ---------------------------------------------------------------------------


def test_ref_resolves_against_field_values_id():
    wb = _wb([
        _prim("acad:Paper:p1", "acad:Paper", id="paper-p1"),
        _prim(
            "acad:Claim:c1",
            "acad:Claim",
            id="claim-c1",
            paper="paper-p1",
            section="section-known",
            kind="hypothesis",
            statement="x",
        ),
        _prim("acad:Section:s1", "acad:Section", id="section-known"),
    ])
    findings = check_referential_integrity(wb)
    assert findings == []


def test_ref_dangling_is_error():
    wb = _wb([
        _prim(
            "acad:Claim:c1",
            "acad:Claim",
            id="claim-c1",
            paper="paper-missing",
            section="section-missing",
            kind="hypothesis",
            statement="x",
        ),
    ])
    findings = check_referential_integrity(wb)
    rule_ids = {f.rule_id for f in findings}
    assert rule_ids == {"acad.ref.dangling"}
    assert len(findings) == 2  # paper + section both dangle


def test_ref_type_mismatch_is_error():
    wb = _wb([
        _prim("acad:Section:s1", "acad:Section", id="paper-p1"),
        _prim(
            "acad:Claim:c1",
            "acad:Claim",
            id="claim-c1",
            paper="paper-p1",
            kind="hypothesis",
            statement="x",
        ),
    ])
    findings = check_referential_integrity(wb)
    assert any(f.rule_id == "acad.ref.type-mismatch" for f in findings)


def test_list_ref_field_each_item_checked():
    wb = _wb([
        _prim("acad:Claim:c1", "acad:Claim", id="claim-c1", kind="hypothesis", statement="x"),
        _prim(
            "acad:Claim:c2",
            "acad:Claim",
            id="claim-c2",
            kind="hypothesis",
            statement="y",
            derivesFrom=["claim-c1", "claim-missing"],
        ),
    ])
    findings = check_referential_integrity(wb)
    assert len(findings) == 1
    assert findings[0].message.endswith(
        "does not resolve to a primitive in this workbook"
    )


# ---------------------------------------------------------------------------
# R-MIRROR: mirror-relation consistency
# ---------------------------------------------------------------------------


def test_mirror_relation_present_no_warning():
    wb = _wb(
        [
            _prim("acad:Paper:p1", "acad:Paper", id="paper-p1"),
            _prim(
                "acad:Claim:c1",
                "acad:Claim",
                id="claim-c1",
                paper="paper-p1",
                kind="hypothesis",
                statement="x",
            ),
        ],
        [_rel("acad:ClaimPaper:c1", "acad:ClaimPaper", "acad:Claim:c1", "acad:Paper:p1")],
    )
    findings = check_mirror_relations(wb)
    assert findings == []


def test_mirror_relation_missing_is_warning():
    wb = _wb([
        _prim("acad:Paper:p1", "acad:Paper", id="paper-p1"),
        _prim(
            "acad:Claim:c1",
            "acad:Claim",
            id="claim-c1",
            paper="paper-p1",
            kind="hypothesis",
            statement="x",
        ),
    ])
    findings = check_mirror_relations(wb)
    assert len(findings) == 1
    assert findings[0].rule_id == "acad.mirror.missing-relation"
    assert findings[0].level == "warning"
    assert "ClaimPaper" in findings[0].message


# ---------------------------------------------------------------------------
# R-CITE: citation completeness
# ---------------------------------------------------------------------------


def test_citation_without_context_warns():
    wb = _wb([
        _prim("acad:Work:w1", "acad:Work", id="work-w1", title="t", kind="book"),
        _prim(
            "acad:Citation:c1",
            "acad:Citation",
            id="citation-c1",
            citedWork="work-w1",
            kind="cites-as-related",
        ),
    ])
    findings = check_citations(wb)
    assert any(f.rule_id == "acad.citation.no-context" for f in findings)


def test_uncited_work_emits_info():
    wb = _wb([
        _prim("acad:Work:w1", "acad:Work", id="work-w1", title="t", kind="book"),
    ])
    findings = check_citations(wb)
    assert [f.rule_id for f in findings] == ["acad.work.uncited"]
    assert findings[0].level == "info"


def test_cited_work_with_context_is_silent():
    wb = _wb([
        _prim("acad:Work:w1", "acad:Work", id="work-w1", title="t", kind="book"),
        _prim(
            "acad:Citation:c1",
            "acad:Citation",
            id="citation-c1",
            citingSection="section-x",
            citedWork="work-w1",
            kind="cites-as-related",
        ),
    ])
    findings = check_citations(wb)
    assert findings == []


# ---------------------------------------------------------------------------
# R-EQDAG: equation derivation DAG
# ---------------------------------------------------------------------------


def test_equation_dag_acyclic_passes():
    wb = _wb([
        _prim("acad:Equation:a", "acad:Equation", id="eq-a", role="definition"),
        _prim(
            "acad:Equation:b",
            "acad:Equation",
            id="eq-b",
            role="derived",
            derivesFrom=["eq-a"],
        ),
        _prim(
            "acad:Equation:c",
            "acad:Equation",
            id="eq-c",
            role="derived",
            derivesFrom=["eq-b"],
        ),
    ])
    findings = check_equation_dag(wb)
    # Three equations: a (definition, OK), b/c (derived with derivesFrom, OK)
    assert findings == []


def test_equation_dag_cycle_detected():
    wb = _wb([
        _prim(
            "acad:Equation:a",
            "acad:Equation",
            id="eq-a",
            role="derived",
            derivesFrom=["eq-b"],
        ),
        _prim(
            "acad:Equation:b",
            "acad:Equation",
            id="eq-b",
            role="derived",
            derivesFrom=["eq-a"],
        ),
    ])
    findings = check_equation_dag(wb)
    cycles = [f for f in findings if f.rule_id == "acad.equation.cycle"]
    assert cycles, "expected a cycle finding"
    assert "->" in cycles[0].message


def test_derived_equation_without_source_warns():
    wb = _wb([
        _prim(
            "acad:Equation:a",
            "acad:Equation",
            id="eq-a",
            role="derived",
        ),
    ])
    findings = check_equation_dag(wb)
    assert any(f.rule_id == "acad.equation.derived-no-source" for f in findings)


def test_definition_equation_without_source_is_silent():
    wb = _wb([
        _prim(
            "acad:Equation:a",
            "acad:Equation",
            id="eq-a",
            role="definition",
        ),
    ])
    findings = check_equation_dag(wb)
    assert findings == []


# ---------------------------------------------------------------------------
# R-STREE: section parent tree
# ---------------------------------------------------------------------------


def test_section_root_without_paper_errors():
    wb = _wb([
        _prim("acad:Section:s1", "acad:Section", id="section-s1"),
    ])
    findings = check_section_tree(wb)
    assert any(f.rule_id == "acad.section.orphan-root" for f in findings)


def test_section_parent_cycle_detected():
    wb = _wb([
        _prim(
            "acad:Section:a",
            "acad:Section",
            id="section-a",
            paper="paper-p",
            parent="section-b",
        ),
        _prim(
            "acad:Section:b",
            "acad:Section",
            id="section-b",
            paper="paper-p",
            parent="section-a",
        ),
    ])
    findings = check_section_tree(wb)
    cycles = [f for f in findings if f.rule_id == "acad.section.parent-cycle"]
    assert cycles


def test_section_with_paper_and_no_parent_is_silent():
    wb = _wb([
        _prim(
            "acad:Section:s1",
            "acad:Section",
            id="section-s1",
            paper="paper-p1",
        ),
    ])
    findings = check_section_tree(wb)
    assert findings == []


# ---------------------------------------------------------------------------
# R-CONCEPT: defined-or-borrowed
# ---------------------------------------------------------------------------


def test_concept_with_definition_passes():
    wb = _wb([
        _prim("acad:Concept:c", "acad:Concept", id="concept-c", label="C"),
        _prim(
            "acad:Definition:d",
            "acad:Definition",
            id="defn-d",
            concept="concept-c",
            body="...",
            provenance="stipulated",
        ),
    ])
    findings = check_concepts_defined_or_borrowed(wb)
    assert findings == []


def test_concept_with_borrows_relation_passes():
    wb = _wb(
        [
            _prim("acad:Concept:c", "acad:Concept", id="concept-c", label="C"),
            _prim(
                "acad:Theorist:t",
                "acad:Theorist",
                id="theorist-t",
                fullName="T",
                familyName="T",
            ),
        ],
        [
            _rel(
                "acad:ConceptBorrowsFrom:c-t",
                "acad:ConceptBorrowsFrom",
                "acad:Concept:c",
                "acad:Theorist:t",
            )
        ],
    )
    findings = check_concepts_defined_or_borrowed(wb)
    assert findings == []


def test_concept_without_either_errors():
    wb = _wb([
        _prim("acad:Concept:c", "acad:Concept", id="concept-c", label="C"),
    ])
    findings = check_concepts_defined_or_borrowed(wb)
    assert len(findings) == 1
    assert findings[0].rule_id == "acad.concept.defined-or-borrowed"
    assert findings[0].level == "error"


# ---------------------------------------------------------------------------
# Native findings ingestion
# ---------------------------------------------------------------------------


def test_collect_native_findings_flattens_buckets():
    payload = {
        "primitives": [
            {
                "target_id": "acad:Paper:p",
                "accepted": False,
                "findings": [
                    {
                        "rule_id": "fdpm.x:y",
                        "level": "error",
                        "target_id": "acad:Concept:k",
                        "message": "msg",
                    }
                ],
            }
        ],
        "relations": [],
    }
    out = collect_native_findings(payload)
    assert len(out) == 1
    assert out[0].source == "fdpm-native"
    assert out[0].rule_id == "fdpm.x:y"


def test_accepted_entries_are_ignored():
    payload = {
        "primitives": [
            {"target_id": "acad:Paper:p", "accepted": True, "findings": []},
        ]
    }
    assert collect_native_findings(payload) == []


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def test_render_human_groups_by_rule_and_truncates():
    wb = _wb([])
    findings = [
        Finding(rule_id="acad.x", level="warning", target_id=f"id-{i}", message="m")
        for i in range(12)
    ]
    out = render_human(wb, findings)
    assert "[acad.x] 12" in out
    assert "and 4 more" in out  # 12 - 8 displayed


def test_render_json_is_valid_json():
    import json as _json

    wb = _wb([])
    findings = [Finding(rule_id="r", level="error", target_id="t", message="m")]
    body = _json.loads(render_json(wb, findings))
    assert body["summary"]["errors"] == 1
    assert body["findings"][0]["rule_id"] == "r"


# ---------------------------------------------------------------------------
# Orchestrator with stub client
# ---------------------------------------------------------------------------


class _StubClient:
    def __init__(self, wb_meta, primitives, relations, native=None):
        self._meta = wb_meta
        self._primitives = primitives
        self._relations = relations
        self._native = native or {}

    def workbook_get(self, _id):
        return self._meta

    def primitive_list(self, _id):
        return self._primitives

    def relation_list(self, _id):
        return self._relations

    def validate_native(self, _id):
        return self._native


def test_run_validation_rejects_wrong_profile():
    from acad_validate import FdpmError

    client = _StubClient(
        wb_meta={
            "id": "x",
            "revision": 1,
            "profile_id": "profile:other:1.0",
        },
        primitives=[],
        relations=[],
    )
    with pytest.raises(FdpmError):
        run_validation(client, "x")


def test_run_validation_aggregates_native_and_acad():
    client = _StubClient(
        wb_meta={
            "id": "x",
            "revision": 1,
            "profile_id": "profile:academic-paper:0.4.1",
        },
        primitives=[
            _prim("acad:Concept:c", "acad:Concept", id="concept-c", label="C"),
        ],
        relations=[],
        native={
            "primitives": [
                {
                    "target_id": "acad:Paper:p",
                    "accepted": False,
                    "findings": [
                        {
                            "rule_id": "fdpm.foo",
                            "level": "error",
                            "target_id": "acad:Concept:c",
                            "message": "native rule fired",
                        }
                    ],
                }
            ]
        },
    )
    _wb_obj, findings = run_validation(client, "x")
    sources = {f.source for f in findings}
    assert sources == {"fdpm-native", "acad_validate"}
