"""Tests for fdpm_to_latex.

Run with:
    uv run --with pytest pytest scripts/test_fdpm_to_latex.py
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import sys
sys.path.insert(0, str(Path(__file__).parent))

from fdpm_to_latex import (
    LatexRenderer,
    RenderOptions,
    SchemaError,
    Workbook,
    apply_unicode_subs,
    compile_pdf,
    safe_label,
    tex_escape,
)


# ---------------------------------------------------------------------------
# Workbook fixture builders
# ---------------------------------------------------------------------------


def _prim(qid: str, **fv):
    if "id" not in fv:
        fv["id"] = qid.split(":", 2)[-1]
    return {"id": qid, "type_id": ":".join(qid.split(":", 2)[:2]), "field_values": fv}


def _rel(qid: str, source: str, target: str):
    return {"id": qid, "source_id": source, "target_id": target}


def _build(primitives, relations=None) -> Workbook:
    data = {
        "workbook": {"id": "test-wb", "name": "T", "profile_id": "p", "revision": 1},
        "primitives": {p["id"]: p for p in primitives},
        "relations": {r["id"]: r for r in (relations or [])},
    }
    tmp = Path("/tmp/_fdpm_test_input.json")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    return Workbook.load(tmp)


# ---------------------------------------------------------------------------
# tex_escape / safe_label / apply_unicode_subs
# ---------------------------------------------------------------------------


def test_tex_escape_handles_all_specials():
    src = r"a&b%c$d#e_f^g~h{i}j\k"
    out = tex_escape(src)
    # No raw special should remain
    for ch in ("&", "%", "$", "#", "_"):
        assert ch not in out.replace(rf"\{ch}", "")
    assert r"\textbackslash{}" in out
    assert r"\{" in out and r"\}" in out


def test_safe_label_replaces_invalid_chars():
    assert safe_label("acad:Claim:foo-bar.baz") == "acad-Claim-foo-bar-baz"


def test_apply_unicode_subs_wraps_math_symbols():
    assert apply_unicode_subs("dim(𝓕) > dim(S)") == r"dim($\mathcal{F}$) > dim(S)"
    assert apply_unicode_subs("Ω.0") == r"$\Omega$.0"
    assert apply_unicode_subs("a → b") == r"a $\rightarrow$ b"


def test_combining_macron_is_dropped():
    # Standalone combining macron emits as nothing (not a question mark).
    assert apply_unicode_subs("X̄") == "X"


# ---------------------------------------------------------------------------
# Workbook.load + reference resolution
# ---------------------------------------------------------------------------


def test_workbook_load_indexes_by_local_id():
    wb = _build([
        _prim("acad:Paper:p", id="paper-p", title="T", language="en"),
        _prim("acad:Section:s1", id="section-s1", paper="paper-p", title="S"),
    ])
    assert "paper-p" in wb.local_to_qualified
    # Local-id resolution works (slug -> primitive)
    assert wb.resolve("paper-p")["id"] == "acad:Paper:p"
    # Qualified-id resolution works
    assert wb.resolve("acad:Paper:p")["id"] == "acad:Paper:p"


def test_workbook_load_rejects_non_fdpm_json(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"hello": "world"}))
    with pytest.raises(SchemaError):
        Workbook.load(bad)


def test_outgoing_and_incoming_relation_lookup():
    wb = _build(
        [
            _prim("acad:Paper:p"),
            _prim("acad:Section:s"),
        ],
        [_rel("acad:SectionPaper:s", "acad:Section:s", "acad:Paper:p")],
    )
    assert wb.out("acad:Section:s", "SectionPaper") == ["acad:Paper:p"]
    assert wb.inc("acad:Paper:p", "SectionPaper") == ["acad:Section:s"]


# ---------------------------------------------------------------------------
# LatexRenderer: full render shape checks
# ---------------------------------------------------------------------------


def _renderer(primitives, relations=None, **opts) -> LatexRenderer:
    wb = _build(primitives, relations)
    return LatexRenderer(wb, RenderOptions(**opts))


def test_render_paper_metadata_emits_keywords_and_method():
    r = _renderer([
        _prim(
            "acad:Paper:p",
            title="T", abstract="An abstract.",
            epistemicMethod="theoretical", format="essay",
            language="en", keywords=["foo", "bar"],
        ),
    ])
    out = r.render()
    assert "fdpmmetabox" in out
    assert "Epistemic method" in out
    assert "theoretical" in out
    assert "Keywords" in out and "foo, bar" in out


def test_render_titlepage_includes_orcid_role_email():
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim(
                "acad:Author:a",
                paper="paper-p",
                fullName="Ada Lovelace",
                familyName="Lovelace",
                givenNames="Ada",
                email="ada@example.org",
                orcid="0000-0000-0000-0000",
                role="lead",
                position="first",
                contributions=["conceptualization"],
            ),
        ],
        [_rel("acad:AuthorPaper:a", "acad:Author:a", "acad:Paper:p")],
    )
    out = r.render()
    assert "Ada Lovelace" in out
    assert "ORCID" in out and "0000-0000-0000-0000" in out
    assert "ada@example.org" in out
    assert "role:" in out and "lead" in out
    assert "conceptualization" in out


def test_finding_uses_fdpmfinding_environment():
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim("acad:Section:s", paper="paper-p", title="S"),
            _prim(
                "acad:Finding:f",
                paper="paper-p",
                section="section-s",
                statement="A finding.",
                outcome="supports",
            ),
        ],
        [
            _rel("acad:SectionPaper:s", "acad:Section:s", "acad:Paper:p"),
            _rel("acad:FindingSection:f", "acad:Finding:f", "acad:Section:s"),
        ],
    )
    out = r.render()
    assert r"\begin{fdpmfinding}" in out
    assert r"\end{fdpmfinding}" in out
    assert "Outcome:" in out
    # Must NOT be wrapped in fdpmclaim by accident
    assert r"\begin{fdpmclaim}" not in out


def test_claim_derivesfrom_emits_autoref():
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim("acad:Section:s", paper="paper-p", title="S"),
            _prim(
                "acad:Claim:base",
                paper="paper-p",
                section="section-s",
                kind="postulate",
                statement="The base.",
            ),
            _prim(
                "acad:Claim:derived",
                paper="paper-p",
                section="section-s",
                kind="hypothesis",
                statement="The derived.",
            ),
        ],
        [
            _rel("acad:SectionPaper:s", "acad:Section:s", "acad:Paper:p"),
            _rel("acad:ClaimSection:b", "acad:Claim:base", "acad:Section:s"),
            _rel("acad:ClaimSection:d", "acad:Claim:derived", "acad:Section:s"),
            _rel(
                "acad:ClaimDerivesFrom:d-b",
                "acad:Claim:derived",
                "acad:Claim:base",
            ),
        ],
    )
    out = r.render()
    assert r"\autoref{acad-Claim-base}" in out
    assert "Derives from:" in out


def test_equation_derivation_emits_autoref():
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim("acad:Section:s", paper="paper-p", title="S"),
            _prim(
                "acad:Equation:a",
                paper="paper-p",
                section="section-s",
                label="A",
                tex="A=A",
                role="definition",
            ),
            _prim(
                "acad:Equation:b",
                paper="paper-p",
                section="section-s",
                label="B",
                tex="B=A+1",
                role="derived",
            ),
        ],
        [
            _rel("acad:SectionPaper:s", "acad:Section:s", "acad:Paper:p"),
            _rel("acad:EquationSection:a", "acad:Equation:a", "acad:Section:s"),
            _rel("acad:EquationSection:b", "acad:Equation:b", "acad:Section:s"),
            _rel("acad:EquationDerivesFrom:b-a", "acad:Equation:b", "acad:Equation:a"),
        ],
    )
    out = r.render()
    assert r"\autoref{acad-Equation-a}" in out
    assert "derives from" in out


def test_multi_paragraph_body_text_is_split():
    long_body = "First paragraph.\n\nSecond paragraph.\n\nThird."
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim("acad:Section:s", paper="paper-p", title="S", bodyText=long_body),
        ],
        [_rel("acad:SectionPaper:s", "acad:Section:s", "acad:Paper:p")],
    )
    out = r.render()
    # Each paragraph should appear; the blank-line separator between them
    # in the output makes them distinct LaTeX paragraphs.
    assert "First paragraph." in out
    assert "Second paragraph." in out
    assert "Third." in out


def test_concept_glossary_renders_borrows_and_extends():
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim("acad:Concept:c-base", label="Base", domain="x"),
            _prim("acad:Concept:c-deriv", label="Derived", domain="y"),
            _prim("acad:Theorist:t-foo", fullName="Foo Bar", familyName="Bar"),
        ],
        [
            _rel(
                "acad:ConceptBorrowsFrom:c-deriv-t-foo",
                "acad:Concept:c-deriv",
                "acad:Theorist:t-foo",
            ),
            _rel(
                "acad:ConceptExtends:c-deriv-c-base",
                "acad:Concept:c-deriv",
                "acad:Concept:c-base",
            ),
        ],
    )
    out = r.render()
    assert "Glossary of concepts" in out
    assert "borrows from" in out and "Foo Bar" in out
    assert "extends" in out


def test_concept_extends_emits_hyperlink_not_autoref():
    """Regression test for the ?? rendering bug.

    ConceptExtends targets are description-list items (no LaTeX counter), so
    they must be reached via ``\\hyperlink`` against an explicit
    ``\\hypertarget`` anchor — not via ``\\autoref`` which would produce
    ``??`` at compile time.
    """
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim("acad:Concept:c-base", label="Base", domain="x"),
            _prim("acad:Concept:c-deriv", label="Derived", domain="y"),
        ],
        [
            _rel(
                "acad:ConceptExtends:c-deriv-c-base",
                "acad:Concept:c-deriv",
                "acad:Concept:c-base",
            ),
        ],
    )
    out = r.render()
    # The glossary line "extends ..." must NOT route the Concept→Concept
    # reference through \autoref (which would render as "??" because Concept
    # items have no counter-bound label).
    assert r"\autoref{acad-Concept-c-base}" not in out
    # It MUST go through \hyperlink with the target's display name.
    assert r"\hyperlink{acad-Concept-c-base}" in out
    # And there must be a matching \hypertarget anchor on the target's
    # glossary item.
    assert r"\hypertarget{acad-Concept-c-base}{}" in out


def test_theory_primary_theorist_emits_hyperlink_to_theorist_anchor():
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim("acad:Theory:bayes", name="Bayesian inference", summary="..."),
            _prim(
                "acad:Theorist:bayes-t",
                fullName="Thomas Bayes",
                familyName="Bayes",
            ),
        ],
        [
            _rel(
                "acad:TheoryPrimaryTheorist:bayes-bayes-t",
                "acad:Theory:bayes",
                "acad:Theorist:bayes-t",
            ),
        ],
    )
    out = r.render()
    # The "Primary theorist: ..." line must NOT render via \autoref (which
    # would resolve to "??" because Theorist items lack a counter).
    assert r"\autoref{acad-Theorist-bayes-t}" not in out
    assert r"\hyperlink{acad-Theorist-bayes-t}" in out
    assert r"\hypertarget{acad-Theorist-bayes-t}{}" in out
    # The theorist's display name should appear in the link text.
    assert "Thomas Bayes" in out


def test_bibfile_emits_publisher_doi_isbn(tmp_path):
    bib = tmp_path / "out.bib"
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim(
                "acad:Work:w-book",
                kind="book",
                title="A Book",
                authorsFreeText=["X, Y"],
                year=2020,
                publisher="Pub Co",
                venue="Series Name",
                isbn="978-0-00-000000-0",
                doi="10.1234/foo",
            ),
            _prim(
                "acad:Citation:c",
                paper="paper-p",
                citedWork="work-w-book",
                kind="cites-as-related",
            ),
        ],
        [
            _rel("acad:CitationCitedWork:c", "acad:Citation:c", "acad:Work:w-book"),
        ],
        bib_path=bib,
    )
    r.render()
    bib_content = bib.read_text()
    assert "@book{" in bib_content
    assert "publisher = {Pub Co}" in bib_content
    assert "series = {Series Name}" in bib_content  # book uses 'series', not 'publisher'
    assert "isbn = {978-0-00-000000-0}" in bib_content
    assert "doi = {10.1234/foo}" in bib_content


def test_format_work_includes_doi_link():
    r = _renderer(
        [
            _prim("acad:Paper:p", title="T"),
            _prim(
                "acad:Work:w",
                kind="journal-article",
                title="An Article",
                authorsFreeText=["Author, A."],
                year=2020,
                venue="J. Acad.",
                doi="10.1000/abc",
            ),
            _prim(
                "acad:Citation:c",
                paper="paper-p",
                citedWork="work-w",
                kind="cites-as-related",
            ),
        ],
        [_rel("acad:CitationCitedWork:c", "acad:Citation:c", "acad:Work:w")],
    )
    out = r.render()
    assert "10.1000/abc" in out
    assert "https://doi.org/10.1000/abc" in out


def test_toc_is_emitted_when_requested():
    r = _renderer(
        [_prim("acad:Paper:p", title="T")],
        include_toc=True,
    )
    out = r.render()
    assert r"\tableofcontents" in out


def test_toc_absent_by_default():
    r = _renderer([_prim("acad:Paper:p", title="T")])
    assert r"\tableofcontents" not in r.render()


# ---------------------------------------------------------------------------
# compile_pdf
# ---------------------------------------------------------------------------


def test_compile_pdf_raises_when_engine_missing(tmp_path):
    from fdpm_to_latex import PdfBuildError

    tex = tmp_path / "x.tex"
    tex.write_text(r"\documentclass{article}\begin{document}hi\end{document}")
    with pytest.raises(PdfBuildError, match="not found"):
        compile_pdf(tex, engine="not-a-real-engine-binary", bib_path=None)


# ---------------------------------------------------------------------------
# End-to-end smoke (only runs if real instance files are present)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "instance",
    ["proposition-A.json", "proposition-B.json"],
)
def test_smoke_renders_real_instance(instance, tmp_path):
    root = Path(__file__).resolve().parent.parent
    src = root / instance
    if not src.is_file():
        pytest.skip(f"{instance} not present at repo root")
    wb = Workbook.load(src)
    r = LatexRenderer(wb, RenderOptions(bib_path=tmp_path / "out.bib"))
    out = r.render()
    assert r"\begin{document}" in out
    assert r"\end{document}" in out
    assert r"\title" in out
    # The bibliography section appears only if at least one Citation exists.
    if any(q.startswith("acad:Citation:") for q in wb.primitives):
        assert r"\begin{thebibliography}" in out
