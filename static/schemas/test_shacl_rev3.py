"""Regression tests for scientific-paper-cwa-shacl-rev3.ttl.

The tests do three things:

  1. Parse the shapes graph and the AE-relativity fixture with rdflib;
     fail if either is malformed Turtle.
  2. Validate the fixture against the shapes via pyshacl; assert that
     ``conforms=True`` with zero violations. The fixture is the canonical
     full-coverage Layer-B exemplar (every primitive type exercised); if
     a future shape change rejects it, that's a real regression.
  3. Synthesise a small negative-case graph for each high-leverage shape
     and assert pyshacl flags it.

Run with:

    uv run --with pyshacl --with rdflib --with pytest \\
        pytest static/schemas/test_shacl_rev3.py -v

The "with" deps are out-of-tree because pyshacl + rdflib are not in the
project's main lockfile; this test file is opt-in (it's not part of any
pre-commit or CI gate yet).
"""
from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest

rdflib = pytest.importorskip("rdflib")
pyshacl = pytest.importorskip("pyshacl")

SHAPES = Path(__file__).parent / "scientific-paper-cwa-shacl-rev3.ttl"
FIXTURE = Path(__file__).parent.parent / "fixtures" / "AE-relativity.ttl"

SH = rdflib.Namespace("http://www.w3.org/ns/shacl#")


def _validate(data_ttl: str, *, base: str = "https://example.org/data/") -> tuple[bool, list[dict]]:
    """Validate an inline Turtle data graph against the rev3 shapes.

    Returns ``(conforms, violations)`` where each violation is a
    ``dict`` carrying focusNode / severity / message / sourceShape.
    """
    shapes = rdflib.Graph().parse(SHAPES, format="turtle")
    data = rdflib.Graph().parse(data=data_ttl, format="turtle", publicID=base)
    conforms, results_graph, _ = pyshacl.validate(
        data_graph=data,
        shacl_graph=shapes,
        advanced=True,
        inference="none",
    )
    violations = []
    for r in results_graph.subjects(rdflib.RDF.type, SH.ValidationResult):
        violations.append(
            {
                "focus": str(results_graph.value(r, SH.focusNode) or ""),
                "severity": str(results_graph.value(r, SH.resultSeverity) or "").rsplit("#", 1)[-1],
                "message": str(results_graph.value(r, SH.resultMessage) or ""),
                "shape": str(results_graph.value(r, SH.sourceShape) or ""),
            }
        )
    return conforms, violations


# ---------------------------------------------------------------------------
# Smoke: file parses and AE-relativity fixture is clean.
# ---------------------------------------------------------------------------


def test_shapes_file_parses():
    g = rdflib.Graph().parse(SHAPES, format="turtle")
    assert len(g) > 0
    n_node_shapes = len(list(g.subjects(rdflib.RDF.type, SH.NodeShape)))
    # 24 ID shapes + 24 primitive shapes + 6 layer-A shapes + 3 uniqueness +
    # 2 value-object shapes + 9 cycle shapes ≈ at least 60.
    assert n_node_shapes >= 60, f"too few NodeShapes ({n_node_shapes})"


def test_ae_relativity_fixture_validates_cleanly():
    """The AE-relativity fixture is the canonical full-coverage Layer-B
    exemplar. It should validate without any violation under rev3."""
    shapes = rdflib.Graph().parse(SHAPES, format="turtle")
    data = rdflib.Graph().parse(FIXTURE, format="turtle")
    conforms, results_graph, _ = pyshacl.validate(
        data_graph=data,
        shacl_graph=shapes,
        advanced=True,
        inference="none",
    )
    violations = list(results_graph.subjects(rdflib.RDF.type, SH.ValidationResult))
    if violations:
        # Surface the first few violations in the test output for debugging.
        details = []
        for r in violations[:5]:
            details.append(
                f"  focus={results_graph.value(r, SH.focusNode)}  "
                f"msg={str(results_graph.value(r, SH.resultMessage))[:120]}"
            )
        pytest.fail(
            f"AE-relativity fixture has {len(violations)} SHACL violations:\n"
            + "\n".join(details)
        )
    assert conforms is True


# ---------------------------------------------------------------------------
# Negative-case regression tests for the bug-fix patch.
# ---------------------------------------------------------------------------


def test_id_pattern_rejects_substring_match():
    """Regression: the unanchored slug pattern accepted 'notapaper-foo'
    (the substring 'paper-foo' satisfied the trailing-anchored regex).
    The patched pattern '(^|[/:#])paper-[a-z0-9-]+$' must reject this.
    """
    bad = dedent("""\
        @prefix ap: <https://example.org/academic-paper/> .
        @prefix d:  <https://example.org/data/> .
        <https://example.org/x/notapaper-foo>
            a ap:Paper ;
            ap:id              <https://example.org/x/notapaper-foo> ;
            ap:title           "T" ;
            ap:language        "en" ;
            ap:epistemicMethod "theoretical" ;
            ap:format          "article" ;
            ap:year            2026 .
    """)
    conforms, vios = _validate(bad)
    # We expect at least one pattern-mismatch violation on the Paper IRI.
    assert not conforms
    assert any("pattern" in v["message"].lower() or "paper-" in v["message"]
               for v in vios), vios


def test_id_pattern_accepts_path_prefixed_iri():
    """The patched pattern must still accept IRIs where the slug appears
    after a path separator (`/`) — the most common production layout.
    """
    ok = dedent("""\
        @prefix ap: <https://example.org/academic-paper/> .
        @prefix d:  <https://example.org/data/> .
        <https://example.org/workbook/paper-foo>
            a ap:Paper ;
            ap:id              <https://example.org/workbook/paper-foo> ;
            ap:title           "T" ;
            ap:language        "en" ;
            ap:epistemicMethod "theoretical" ;
            ap:format          "article" ;
            ap:year            2026 .
        # epistemicMethod=theoretical requires ≥1 Equation in this paper.
        <https://example.org/workbook/eq-x> a ap:Equation ;
            ap:id    <https://example.org/workbook/eq-x> ;
            ap:paper <https://example.org/workbook/paper-foo> ;
            ap:role  "definition" ;
            ap:tex   "x = x" .
        # Paper requires ≥1 Author; Author requires ≥1 Affiliation.
        <https://example.org/workbook/author-a> a ap:Author ;
            ap:id           <https://example.org/workbook/author-a> ;
            ap:paper        <https://example.org/workbook/paper-foo> ;
            ap:fullName     "A" ;
            ap:familyName   "A" ;
            ap:affiliations <https://example.org/workbook/affil-x> .
        <https://example.org/workbook/affil-x> a ap:Affiliation ;
            ap:id          <https://example.org/workbook/affil-x> ;
            ap:institution "X" .
    """)
    conforms, vios = _validate(ok)
    assert conforms, f"expected clean validation, got: {vios}"


def test_claim_supersededby_transitive_cycle_detected():
    """Two claims A and B, each supersededBy the other (A→B→A).
    B.99.13 catches self-loops only; the new ClaimSupersededByCycleShape
    catches transitive cycles.
    """
    bad = dedent("""\
        @prefix ap: <https://example.org/academic-paper/> .
        @prefix d:  <https://example.org/data/> .
        d:paper-x a ap:Paper ;
            ap:id <https://example.org/data/paper-x> ; ap:title "T" ;
            ap:language "en" ; ap:epistemicMethod "descriptive" ;
            ap:format "article" ; ap:year 2026 .
        d:author-x a ap:Author ;
            ap:id <https://example.org/data/author-x> ;
            ap:paper d:paper-x ; ap:fullName "X" ; ap:familyName "X" ;
            ap:affiliations d:affil-x .
        d:affil-x a ap:Affiliation ;
            ap:id <https://example.org/data/affil-x> ; ap:institution "X" .
        d:section-x a ap:Section ;
            ap:id <https://example.org/data/section-x> ;
            ap:paper d:paper-x ; ap:label "L" ; ap:title "T" ; ap:order 0 .
        d:claim-a a ap:Claim ;
            ap:id <https://example.org/data/claim-a> ;
            ap:paper d:paper-x ; ap:section d:section-x ;
            ap:kind "descriptive" ; ap:statement "A" ;
            ap:supersededBy d:claim-b .
        d:claim-b a ap:Claim ;
            ap:id <https://example.org/data/claim-b> ;
            ap:paper d:paper-x ; ap:section d:section-x ;
            ap:kind "descriptive" ; ap:statement "B" ;
            ap:supersededBy d:claim-a .
    """)
    conforms, vios = _validate(bad)
    assert not conforms
    assert any("supersededBy" in v["message"] and "cycle" in v["message"].lower()
               for v in vios), \
        f"expected supersededBy cycle violation, got: {[v['message'] for v in vios]}"


def test_quotation_translatedfrom_cycle_detected():
    bad = dedent("""\
        @prefix ap: <https://example.org/academic-paper/> .
        @prefix d:  <https://example.org/data/> .
        d:paper-x a ap:Paper ;
            ap:id <https://example.org/data/paper-x> ; ap:title "T" ;
            ap:language "en" ; ap:epistemicMethod "literary-critical" ;
            ap:format "article" ; ap:year 2026 .
        d:author-x a ap:Author ;
            ap:id <https://example.org/data/author-x> ;
            ap:paper d:paper-x ; ap:fullName "X" ; ap:familyName "X" ;
            ap:affiliations d:affil-x .
        d:affil-x a ap:Affiliation ;
            ap:id <https://example.org/data/affil-x> ; ap:institution "X" .
        d:work-x a ap:Work ;
            ap:id <https://example.org/data/work-x> ;
            ap:kind "book" ; ap:title "W" .
        d:quote-a a ap:Quotation ;
            ap:id <https://example.org/data/quote-a> ;
            ap:paper d:paper-x ; ap:quotesFrom d:work-x ;
            ap:locator "p.1" ; ap:body "A" ; ap:bodyLanguage "en" ;
            ap:translatedFrom d:quote-b .
        d:quote-b a ap:Quotation ;
            ap:id <https://example.org/data/quote-b> ;
            ap:paper d:paper-x ; ap:quotesFrom d:work-x ;
            ap:locator "p.2" ; ap:body "B" ; ap:bodyLanguage "en" ;
            ap:translatedFrom d:quote-a .
    """)
    conforms, vios = _validate(bad)
    assert not conforms
    assert any("translatedFrom" in v["message"] and "cycle" in v["message"].lower()
               for v in vios), \
        f"expected translatedFrom cycle violation, got: {[v['message'] for v in vios]}"


# ---------------------------------------------------------------------------
# Pattern sanity (every ID-slug pattern is anchored).
# ---------------------------------------------------------------------------


def test_every_node_shape_has_rdfs_comment():
    """Documentation guard: every NodeShape in the file carries at least
    one ``rdfs:comment``. Added in the doc-pass on top of rev3 — readers
    and downstream tooling can rely on machine-extractable shape docs.
    """
    g = rdflib.Graph().parse(SHAPES, format="turtle")
    RDFS = rdflib.Namespace("http://www.w3.org/2000/01/rdf-schema#")
    shapes = list(g.subjects(rdflib.RDF.type, SH.NodeShape))
    missing = [
        str(s) for s in shapes
        if next(g.objects(s, RDFS.comment), None) is None
    ]
    assert not missing, (
        f"{len(missing)} NodeShape(s) lack rdfs:comment:\n  "
        + "\n  ".join(missing[:20])
    )
    # The current file has 72 shapes; if you add or remove a shape and
    # the doc-pass is rerun, this floor should stay ≥ 60.
    assert len(shapes) >= 60, f"unexpectedly few NodeShapes ({len(shapes)})"


def test_every_id_slug_pattern_is_anchored():
    """All 48 ID-slug sh:pattern strings must carry the `(^|[/:#])`
    prefix introduced by the in-place fix patch. Naked
    `<slug>-[a-z0-9-]+$` patterns are the pre-patch buggy form."""
    g = rdflib.Graph().parse(SHAPES, format="turtle")
    patterns = [str(o) for o in g.objects(predicate=SH.pattern)]
    slug_prefixes = (
        "paper", "author", "affil", "section", "claim", "evidence", "quote",
        "work", "concept", "defn", "theorist", "theory", "method", "finding",
        "limit", "note", "eq", "fig", "citation", "funding", "funder",
        "table", "prel", "erratum",
    )
    naked = [
        p for p in patterns
        if any(p.startswith(f"{prefix}-") for prefix in slug_prefixes)
    ]
    assert not naked, (
        f"found {len(naked)} unanchored ID-slug pattern(s) — re-apply the "
        f"in-place fix:\n  " + "\n  ".join(naked)
    )
    anchored = [p for p in patterns if p.startswith("(^|[/:#])")]
    assert len(anchored) == 48, (
        f"expected 48 (^|[/:#])-anchored ID patterns, got {len(anchored)}"
    )
