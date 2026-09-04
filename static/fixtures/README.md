# Static fixture provenance

## Disclaimer

This work is subject to the methodological caveats and commitments described in [@DISCLAIMER.md](../../DISCLAIMER.md).
> No statement or premise not backed by a real logical definition or verifiable reference should be taken for granted.

Back to the [root README](../../README.md).

This directory contains inputs used to exercise schemas and renderers. A
fixture is not evidence that its subject-matter claims are current or correct.

| File | Origin and release treatment |
| --- | --- |
| `AE-relativity.ttl` | Repository-authored structured test data modelling the 1920 Robert W. Lawson translation of Einstein's *Relativity*. The file identifies quoted passages and its own generation history. The archive PDF from which the fixture was prepared was removed because it was unused and carried separate GNU Free Documentation License obligations. |
| `PALS_LAW-v1.5.4.pdf` | Draft authored by Pedro Anisio de Luna e Silva and generated from the author's LaTeX workflow. The PDF metadata and first page identify the author, version, status, and generation method. |
| `business-deck-dos-5_2.ts` | Repository-authored synthetic business-deck fixture. It is an intentionally provocative scenario, not operational advice or a product recommendation. |
| `sales-deck-fdpm.ts` | Repository-authored synthetic product-positioning fixture. Claims inside the deck remain subject to the repository disclaimer and must not be presented as independently verified market evidence. |
| `relativized_irreducibility_updated_paper_draft.md` | Repository-authored working draft. Its epistemic labels and references are part of the fixture and do not establish peer review. |
| `relativized-irreducibility-case-study/case-study.spec.yaml` | Repository-authored six-axis backend specification (framework 1.1.0) that the paper above cites by name and SHA-256 in its §13.3. Editing it changes the hash the paper reports. Not used by any test. |
| `relativized-irreducibility-case-study/run_falsifiers.py` | Repository-authored measurement runner for the paper's §14.4. It needs the external backend-specification toolchain (`--toolchain` or `BACKEND_SPEC_TOOLCHAIN`), which is not part of this repository. Not used by any test. |
| `relativized-irreducibility-case-study/results.json` | Recorded run of the runner above. Every number in the paper's §13.6 and §14.4 is quoted from this file; it records the specification, schema, and catalog hashes it ran against. |

`DLS-risos-rasuras.pdf` was removed during the public-readiness pass because it
was unused and the repository did not contain an explicit redistribution grant
from its named author. Do not restore external documents without recording the
source, author, license or permission basis, expected use, and the test that
requires them.

The repository's open-source license has not yet been selected. Once selected,
the maintainer must confirm that every retained repository-authored fixture is
included under it or state a file-specific exception here.
