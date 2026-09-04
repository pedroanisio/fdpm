---
disclaimer:
  version: "2.0"
  last_updated: "2026-09-04"
  languages:
    - "pt-BR"
    - "en-US"

  # Version 2.0 replaces the v1 notice ("may be invalid, erroneous, or a
  # hallucination") with a verification statement, the same edit the
  # Silent Acceptance specification made in its v2.0.0 revision
  # (§11.6: "replaced the front-of-document disclaimer with the
  # verification statement"). The caveats and commitments are unchanged.
  principle:
    name: "Verification Boundary Principle"
    source: "Silent Acceptance: LLM Output Error as an Architectural Invariant, v2.0.0"
    doi: "10.5281/zenodo.19401266"

  notice:
    en-US: >-
      No statement or premise not backed by a real logical definition
      or verifiable reference should be taken for granted. A claim is
      reliable to the extent that it names what verifies it: a logical
      definition, a test that ran, a measurement, or a reference that
      resolves. A claim that names none of these is unverified and is to
      be read as a claim, not as a fact. Where a document states what was
      verified and how, that statement is its verification boundary.
    pt-BR: >-
      Nenhuma afirmação ou premissa não respaldada por uma definição
      lógica real ou referência verificável deve ser tomada como
      garantida. Uma afirmação é confiável na medida em que nomeia o que
      a verifica: uma definição lógica, um teste executado, uma medição
      ou uma referência que resolve. Uma afirmação que não nomeia nada
      disso não está verificada e deve ser lida como afirmação, não como
      fato. Onde um documento declara o que foi verificado e como, essa
      declaração é sua fronteira de verificação.

  caveats:
    - id: 1
      key: "non-definitiveness"
      en-US: >-
        This work, like any product of the scientific method, does not present
        itself as definitive. Its results are provisional by nature and remain
        subject to revision upon superior evidence.
      pt-BR: >-
        Este trabalho, como qualquer produto do método científico, não se
        apresenta como definitivo. Seus resultados são provisórios por
        natureza e permanecem sujeitos a revisão mediante evidência superior.

    - id: 2
      key: "unintentional-omissions"
      en-US: >-
        Omissions may exist but are not deliberate. Where identified, they
        should be treated as gaps to be filled.
      pt-BR: >-
        Omissões podem existir, mas não são deliberadas. Onde identificadas,
        devem ser tratadas como lacunas a preencher.

    - id: 3
      key: "interdisciplinarity-as-method"
      en-US: >-
        Analogies and cross-pollination between disciplines are methodological
        tools employed intentionally, not rhetorical diversions. The
        transposition of concepts across domains is explicit and traceable.
      pt-BR: >-
        Analogias e polinização cruzada entre disciplinas são ferramentas
        metodológicas empregadas intencionalmente, não desvios retóricos.
        A transposição de conceitos entre domínios é explícita e rastreável.

    - id: 4
      key: "openness-to-future-contributions"
      en-US: >-
        This work assumes that subsequent contributions can — and should —
        refine, extend, or correct its results. No section is declared
        closed to revision.
      pt-BR: >-
        O trabalho pressupõe que contribuições subsequentes podem — e devem —
        refinar, estender ou corrigir seus resultados. Nenhuma seção é
        declarada fechada a revisão.

  commitments:
    - id: 5
      key: "immediate-applicability"
      en-US: >-
        The authors consider this work to offer immediate utility to latent
        problems that still lack adequate computational tooling to broaden
        their impact and reach.
      pt-BR: >-
        Os autores consideram que este trabalho oferece utilidade imediata a
        problemas latentes que ainda carecem de ferramental computacional
        adequado para ampliar seu impacto e abrangência.

    - id: 6
      key: "natural-artificial-intelligence-partnership"
      en-US: >-
        The scope of this work is intentionally non-trivial and comprehensive.
        Exponential collaboration between natural and artificial intelligence
        is adopted as an operational principle — treated not as an auxiliary
        resource, but as a constitutive method of the investigation.
      pt-BR: >-
        O escopo deste trabalho é intencionalmente não trivial e abrangente.
        Adota-se como princípio operacional a colaboração exponencial entre
        inteligência natural e artificial — tratando-a não como recurso
        auxiliar, mas como método constitutivo da investigação.

    - id: 7
      key: "traceability-and-provenance"
      en-US: >-
        All references used will be made available in properly documented
        open-source repositories. Media files, where pertinent, will
        explicitly reference their sources; additional provenance details
        will be present in their metadata.
      pt-BR: >-
        Todas as referências utilizadas serão disponibilizadas em repositórios
        de código aberto devidamente documentados. Arquivos de mídia, quando
        pertinentes, farão referência explícita às suas fontes; detalhes
        adicionais de proveniência estarão presentes em seus metadados.

    - id: 8
      key: "verification-boundary-for-model-output"
      en-US: >-
        Every consumer of language-model output in this work declares a
        verification boundary: a typed parse, semantic checks, a defined
        failure path, a test that exercises that path, and bounds owned by
        ordinary code. Output that has not crossed such a boundary is
        untrusted by construction, however correct it appears.
      pt-BR: >-
        Todo consumidor de saída de modelo de linguagem neste trabalho
        declara uma fronteira de verificação: um parse tipado, checagens
        semânticas, um caminho de falha definido, um teste que exercita esse
        caminho e limites controlados por código comum. Saída que não
        atravessou essa fronteira é não confiável por construção, por mais
        correta que pareça.
---

<!--
╔══════════════════════════════════════════════════════════════════════════════╗
║                        RESSALVAS METODOLÓGICAS                             ║
║                        METHODOLOGICAL CAVEATS                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Versão / Version: 2.0                                                     ║
║  Última atualização / Last updated: 2026-09-04                             ║
╚══════════════════════════════════════════════════════════════════════════════╝

  PORTUGUÊS (PT-BR)
  ═════════════════

  RESSALVAS

  1. NÃO DEFINITIVIDADE.
     Este trabalho, como qualquer produto do método científico, não se
     apresenta como definitivo. Seus resultados são provisórios por
     natureza e permanecem sujeitos a revisão mediante evidência superior.

  2. OMISSÕES NÃO INTENCIONAIS.
     Omissões podem existir, mas não são deliberadas. Onde identificadas,
     devem ser tratadas como lacunas a preencher.

  3. INTERDISCIPLINARIDADE COMO MÉTODO.
     Analogias e polinização cruzada entre disciplinas são ferramentas
     metodológicas empregadas intencionalmente, não desvios retóricos.
     A transposição de conceitos entre domínios é explícita e rastreável.

  4. ABERTURA A CONTRIBUIÇÕES FUTURAS.
     O trabalho pressupõe que contribuições subsequentes podem — e devem —
     refinar, estender ou corrigir seus resultados. Nenhuma seção é
     declarada fechada a revisão.

  COMPROMISSOS METODOLÓGICOS

  5. APLICABILIDADE IMEDIATA.
     Os autores consideram que este trabalho oferece utilidade imediata a
     problemas latentes que ainda carecem de ferramental computacional
     adequado para ampliar seu impacto e abrangência.

  6. NÃO TRIVIALIDADE E PARCERIA ENTRE INTELIGÊNCIA NATURAL E ARTIFICIAL.
     O escopo deste trabalho é intencionalmente não trivial e abrangente.
     Adota-se como princípio operacional a colaboração exponencial entre
     inteligência natural e artificial — tratando-a não como recurso
     auxiliar, mas como método constitutivo da investigação.

  7. RASTREABILIDADE E PROVENIÊNCIA.
     Todas as referências utilizadas serão disponibilizadas em repositórios
     de código aberto devidamente documentados. Arquivos de mídia, quando
     pertinentes, farão referência explícita às suas fontes; detalhes
     adicionais de proveniência estarão presentes em seus metadados.

  8. FRONTEIRA DE VERIFICAÇÃO PARA SAÍDA DE MODELOS.
     Todo consumidor de saída de modelo de linguagem neste trabalho
     declara uma fronteira de verificação: um parse tipado, checagens
     semânticas, um caminho de falha definido, um teste que exercita esse
     caminho e limites controlados por código comum. Saída que não
     atravessou essa fronteira é não confiável por construção, por mais
     correta que pareça.

  ──────────────────────────────────────────────────────────────────────────

  ENGLISH (EN-US)
  ═══════════════

  CAVEATS

  1. NON-DEFINITIVENESS.
     This work, like any product of the scientific method, does not present
     itself as definitive. Its results are provisional by nature and remain
     subject to revision upon superior evidence.

  2. UNINTENTIONAL OMISSIONS.
     Omissions may exist but are not deliberate. Where identified, they
     should be treated as gaps to be filled.

  3. INTERDISCIPLINARITY AS METHOD.
     Analogies and cross-pollination between disciplines are methodological
     tools employed intentionally, not rhetorical diversions. The
     transposition of concepts across domains is explicit and traceable.

  4. OPENNESS TO FUTURE CONTRIBUTIONS.
     This work assumes that subsequent contributions can — and should —
     refine, extend, or correct its results. No section is declared
     closed to revision.

  METHODOLOGICAL COMMITMENTS

  5. IMMEDIATE APPLICABILITY.
     The authors consider this work to offer immediate utility to latent
     problems that still lack adequate computational tooling to broaden
     their impact and reach.

  6. NON-TRIVIALITY AND NATURAL–ARTIFICIAL INTELLIGENCE PARTNERSHIP.
     The scope of this work is intentionally non-trivial and comprehensive.
     Exponential collaboration between natural and artificial intelligence
     is adopted as an operational principle — treated not as an auxiliary
     resource, but as a constitutive method of the investigation.

  7. TRACEABILITY AND PROVENANCE.
     All references used will be made available in properly documented
     open-source repositories. Media files, where pertinent, will
     explicitly reference their sources; additional provenance details
     will be present in their metadata.

  8. VERIFICATION BOUNDARY FOR MODEL OUTPUT.
     Every consumer of language-model output in this work declares a
     verification boundary: a typed parse, semantic checks, a defined
     failure path, a test that exercises that path, and bounds owned by
     ordinary code. Output that has not crossed such a boundary is
     untrusted by construction, however correct it appears.

  ──────────────────────────────────────────────────────────────────────────

  NOTICE / AVISO (v2.0 — verification statement):

  No statement or premise not backed by a real logical definition or
  verifiable reference should be taken for granted. A claim is reliable
  to the extent that it names what verifies it: a logical definition, a
  test that ran, a measurement, or a reference that resolves. A claim
  that names none of these is unverified and is to be read as a claim,
  not as a fact. Where a document states what was verified and how, that
  statement is its verification boundary.

  Nenhuma afirmação ou premissa não respaldada por uma definição lógica
  real ou referência verificável deve ser tomada como garantida. Uma
  afirmação é confiável na medida em que nomeia o que a verifica: uma
  definição lógica, um teste executado, uma medição ou uma referência que
  resolve. Uma afirmação que não nomeia nada disso não está verificada e
  deve ser lida como afirmação, não como fato. Onde um documento declara o
  que foi verificado e como, essa declaração é sua fronteira de
  verificação.

  Principle / Princípio: Verification Boundary Principle — Silent
  Acceptance: LLM Output Error as an Architectural Invariant, v2.0.0,
  doi:10.5281/zenodo.19401266 (formerly PALS's Law, v1.x).

  Version history / Histórico de versões:
  - 1.0 (2026-03-26): initial bilingual caveats, commitments and notice.
  - 2.0 (2026-09-04): notice replaced by the verification statement above;
    commitment 8 added; the principle named and cited. Caveats 1–4 and
    commitments 5–7 unchanged.

-->
