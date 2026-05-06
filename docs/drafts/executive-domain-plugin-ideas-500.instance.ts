/**
 * ============================================================================
 * Executive Domain Plugin Ideas Registry — 500 entries
 * ============================================================================
 *
 * This file is a valid FdpmPluginIdeasRegistry instance generated from the
 * user-provided executive/business-domain vocabulary and expanded to 500 entries.
 * It follows the same module shape as the Claude sample: typed export plus an
 * inline parse call that validates the instance at module load.
 * ============================================================================
 */

import { FdpmPluginIdeasRegistrySchema, type FdpmPluginIdeasRegistry } from "./plugins";

export const executiveDomainPluginIdeasRegistry: FdpmPluginIdeasRegistry = {
  "schemaVersion": "1.0.0",
  "frontmatter": {
    "title": "Executive Domain Plugin Ideas — 500 entries",
    "status": "draft",
    "disclaimer": "No information in this registry should be taken for granted. The entries are calibrated schema/profile candidates derived from a user-provided executive/business-domain vocabulary and expanded with adjacent enterprise concepts. Tier assignments and capability tags are design judgments, not empirical measurements.",
    "provenance": {
      "sourceRequest": "Expand the executive/business-domain vocabulary into 500 valid FdpmPluginIdeasRegistry entries as a TypeScript schema instance.",
      "baseline": "User-provided list of executive, finance, strategy, sales, operations, governance, people, data, technology, and AI domain names; expanded to 500 entries while preserving the one-entry-per-domain concept style.",
      "capabilityKindsReferenced": {
        "count": 6,
        "kinds": [
          "cap:profile",
          "cap:validator",
          "cap:renderer",
          "cap:transformer",
          "cap:lifecycle-hook",
          "cap:asset"
        ],
        "note": "Every entry ships cap:profile. Additional capability tags are assigned only where the domain naturally implies validation, rendering, transformation, lifecycle, or asset behavior."
      }
    }
  },
  "heading": "Executive domain plugin ideas — 500 entries",
  "honestPreamble": {
    "body": "This registry models executive/business concepts as FDPM-style plugin profile candidates. It is not limited to customer service: it spans strategy, portfolio, finance, revenue, governance, risk, compliance, legal, customer lifecycle, people, operations, supply chain, data, technology, AI, software delivery, security, and executive reporting. Tiers prioritize broad enterprise load-bearing value over novelty.",
    "tierDefinitions": [
      {
        "tier": "S",
        "label": "Core executive primitive",
        "meaning": "Foundational enterprise concept that most executives or management systems need across industries."
      },
      {
        "tier": "A",
        "label": "Operationally important",
        "meaning": "Strong enterprise concept used in common workflows, analytics, governance, or cross-functional execution."
      },
      {
        "tier": "B",
        "label": "Specialized",
        "meaning": "Defensible but narrower concept, typically useful in specific functions, industries, maturity stages, or operating models."
      },
      {
        "tier": "C",
        "label": "Calibration edge",
        "meaning": "Low-priority or situational concept included to mark the boundary of the 500-entry expansion."
      }
    ],
    "tierDistribution": {
      "totalEntries": 500,
      "rows": [
        {
          "tier": "S",
          "count": 145
        },
        {
          "tier": "A",
          "count": 265
        },
        {
          "tier": "B",
          "count": 80
        },
        {
          "tier": "C",
          "count": 10
        }
      ]
    },
    "backlogRecommendation": {
      "keepLiveTiers": [
        "S",
        "A"
      ],
      "parkingLotTiers": [
        "B"
      ],
      "calibrationOnlyTiers": [
        "C"
      ],
      "rationale": "Use S and A as the practical enterprise ontology backlog. Treat B entries as demand-driven extensions. Use C entries only as scope-calibration examples."
    },
    "notes": [
      "Display numbers are dense from 1 to 500.",
      "Cross-references are intentionally empty in this first pass so the instance validates without requiring a second pass over relationship topology.",
      "IDs use the executive.* namespace and kebab-case slugs to satisfy FdpmPluginIdSchema."
    ]
  },
  "sections": [
    {
      "title": "Core Enterprise Entities",
      "primaryCapabilityKinds": [
        "cap:profile",
        "cap:validator",
        "cap:transformer",
        "cap:renderer"
      ],
      "description": "Foundational actors, accounts, products, transactions, plans, and executive performance objects.",
      "entries": [
        {
          "displayNumber": 1,
          "id": "executive.cliente",
          "what": "Core executive business profile for Cliente, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Cliente is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Cliente"
          ]
        },
        {
          "displayNumber": 2,
          "id": "executive.fornecedor",
          "what": "Core executive business profile for Fornecedor, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Fornecedor is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Fornecedor"
          ]
        },
        {
          "displayNumber": 3,
          "id": "executive.parceiro",
          "what": "Core executive business profile for Parceiro, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Parceiro is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Parceiro"
          ]
        },
        {
          "displayNumber": 4,
          "id": "executive.produto",
          "what": "Core executive business profile for Produto, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Produto is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Produto"
          ]
        },
        {
          "displayNumber": 5,
          "id": "executive.servico",
          "what": "Core executive business profile for Servico, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Servico is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Servico"
          ]
        },
        {
          "displayNumber": 6,
          "id": "executive.pedido",
          "what": "Core executive business profile for Pedido, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Pedido is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Pedido"
          ]
        },
        {
          "displayNumber": 7,
          "id": "executive.contrato",
          "what": "Core executive business profile for Contrato, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Contrato is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Contrato"
          ]
        },
        {
          "displayNumber": 8,
          "id": "executive.proposta",
          "what": "Core executive business profile for Proposta, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Proposta is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Proposta"
          ]
        },
        {
          "displayNumber": 9,
          "id": "executive.fatura",
          "what": "Core executive business profile for Fatura, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Fatura is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Fatura"
          ]
        },
        {
          "displayNumber": 10,
          "id": "executive.pagamento",
          "what": "Core executive business profile for Pagamento, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Pagamento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Pagamento"
          ]
        },
        {
          "displayNumber": 11,
          "id": "executive.receita",
          "what": "Core executive business profile for Receita, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Receita is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Receita"
          ]
        },
        {
          "displayNumber": 12,
          "id": "executive.despesa",
          "what": "Core executive business profile for Despesa, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Despesa is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Despesa"
          ]
        },
        {
          "displayNumber": 13,
          "id": "executive.orcamento",
          "what": "Core executive business profile for Orcamento, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Orcamento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Orcamento"
          ]
        },
        {
          "displayNumber": 14,
          "id": "executive.centro-custo",
          "what": "Core executive business profile for Centro Custo, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Centro Custo is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CentroCusto"
          ]
        },
        {
          "displayNumber": 15,
          "id": "executive.projeto",
          "what": "Core executive business profile for Projeto, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Projeto is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Projeto"
          ]
        },
        {
          "displayNumber": 16,
          "id": "executive.meta",
          "what": "Core executive business profile for Meta, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Meta is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Meta"
          ]
        },
        {
          "displayNumber": 17,
          "id": "executive.okr",
          "what": "Core executive business profile for OKR, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "OKR is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: OKR"
          ]
        },
        {
          "displayNumber": 18,
          "id": "executive.kpi",
          "what": "Core executive business profile for KPI, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "KPI is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: KPI"
          ]
        },
        {
          "displayNumber": 19,
          "id": "executive.equipe",
          "what": "Core executive business profile for Equipe, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Equipe is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Equipe"
          ]
        },
        {
          "displayNumber": 20,
          "id": "executive.colaborador",
          "what": "Core executive business profile for Colaborador, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Colaborador is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Colaborador"
          ]
        },
        {
          "displayNumber": 21,
          "id": "executive.cargo",
          "what": "Core executive business profile for Cargo, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Cargo is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Cargo"
          ]
        },
        {
          "displayNumber": 22,
          "id": "executive.departamento",
          "what": "Core executive business profile for Departamento, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Departamento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Departamento"
          ]
        },
        {
          "displayNumber": 23,
          "id": "executive.unidade-negocio",
          "what": "Core executive business profile for Unidade Negocio, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Unidade Negocio is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: UnidadeNegocio"
          ]
        },
        {
          "displayNumber": 24,
          "id": "executive.canal",
          "what": "Core executive business profile for Canal, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Canal is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Canal"
          ]
        },
        {
          "displayNumber": 25,
          "id": "executive.campanha",
          "what": "Core executive business profile for Campanha, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Campanha is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Campanha"
          ]
        },
        {
          "displayNumber": 26,
          "id": "executive.lead",
          "what": "Core executive business profile for Lead, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Lead is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Lead"
          ]
        },
        {
          "displayNumber": 27,
          "id": "executive.oportunidade",
          "what": "Core executive business profile for Oportunidade, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Oportunidade is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Oportunidade"
          ]
        },
        {
          "displayNumber": 28,
          "id": "executive.pipeline",
          "what": "Core executive business profile for Pipeline, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Pipeline is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Pipeline"
          ]
        },
        {
          "displayNumber": 29,
          "id": "executive.conta",
          "what": "Core executive business profile for Conta, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Conta is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Conta"
          ]
        },
        {
          "displayNumber": 30,
          "id": "executive.reuniao",
          "what": "Core executive business profile for Reuniao, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Reuniao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Reuniao"
          ]
        },
        {
          "displayNumber": 31,
          "id": "executive.decisao",
          "what": "Core executive business profile for Decisao, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Decisao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Decisao"
          ]
        },
        {
          "displayNumber": 32,
          "id": "executive.risco",
          "what": "Core executive business profile for Risco, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Risco is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Risco"
          ]
        },
        {
          "displayNumber": 33,
          "id": "executive.issue",
          "what": "Core executive business profile for Issue, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Issue is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Issue"
          ]
        },
        {
          "displayNumber": 34,
          "id": "executive.plano-acao",
          "what": "Core executive business profile for Plano Acao, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Plano Acao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoAcao"
          ]
        },
        {
          "displayNumber": 35,
          "id": "executive.roadmap",
          "what": "Core executive business profile for Roadmap, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Roadmap is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Roadmap"
          ]
        },
        {
          "displayNumber": 36,
          "id": "executive.iniciativa",
          "what": "Core executive business profile for Iniciativa, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Iniciativa is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Iniciativa"
          ]
        },
        {
          "displayNumber": 37,
          "id": "executive.prioridade",
          "what": "Core executive business profile for Prioridade, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Prioridade is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Prioridade"
          ]
        },
        {
          "displayNumber": 38,
          "id": "executive.forecast",
          "what": "Core executive business profile for Forecast, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Forecast is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Forecast"
          ]
        },
        {
          "displayNumber": 39,
          "id": "executive.cenario",
          "what": "Core executive business profile for Cenario, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Cenario is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Cenario"
          ]
        },
        {
          "displayNumber": 40,
          "id": "executive.relatorio",
          "what": "Core executive business profile for Relatorio, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Relatorio is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:renderer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Relatorio"
          ]
        },
        {
          "displayNumber": 41,
          "id": "executive.dashboard",
          "what": "Core executive business profile for Dashboard, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Dashboard is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:renderer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Dashboard"
          ]
        },
        {
          "displayNumber": 42,
          "id": "executive.resultado",
          "what": "Core executive business profile for Resultado, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Resultado is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Resultado"
          ]
        },
        {
          "displayNumber": 43,
          "id": "executive.margem",
          "what": "Core executive business profile for Margem, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Margem is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Margem"
          ]
        },
        {
          "displayNumber": 44,
          "id": "executive.cash-flow",
          "what": "Core executive business profile for Cash Flow, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Cash Flow is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CashFlow"
          ]
        },
        {
          "displayNumber": 45,
          "id": "executive.investimento",
          "what": "Core executive business profile for Investimento, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Investimento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Investimento"
          ]
        },
        {
          "displayNumber": 46,
          "id": "executive.capex",
          "what": "Core executive business profile for Capex, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Capex is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Capex"
          ]
        },
        {
          "displayNumber": 47,
          "id": "executive.opex",
          "what": "Core executive business profile for Opex, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Opex is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Opex"
          ]
        },
        {
          "displayNumber": 48,
          "id": "executive.pl",
          "what": "Core executive business profile for PL, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "PL is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PL"
          ]
        },
        {
          "displayNumber": 49,
          "id": "executive.balanco",
          "what": "Core executive business profile for Balanco, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Balanco is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Balanco"
          ]
        },
        {
          "displayNumber": 50,
          "id": "executive.forecast-receita",
          "what": "Core executive business profile for Forecast Receita, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Forecast Receita is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ForecastReceita"
          ]
        },
        {
          "displayNumber": 51,
          "id": "executive.churn",
          "what": "Core executive business profile for Churn, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Churn is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Churn"
          ]
        },
        {
          "displayNumber": 52,
          "id": "executive.nps",
          "what": "Core executive business profile for NPS, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "NPS is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: NPS"
          ]
        },
        {
          "displayNumber": 53,
          "id": "executive.mercado",
          "what": "Core executive business profile for Mercado, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Mercado is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Mercado"
          ]
        },
        {
          "displayNumber": 54,
          "id": "executive.segmento",
          "what": "Core executive business profile for Segmento, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Segmento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Segmento"
          ]
        },
        {
          "displayNumber": 55,
          "id": "executive.persona",
          "what": "Core executive business profile for Persona, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Persona is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Persona"
          ]
        },
        {
          "displayNumber": 56,
          "id": "executive.jornada-cliente",
          "what": "Core executive business profile for Jornada Cliente, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Jornada Cliente is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: JornadaCliente"
          ]
        },
        {
          "displayNumber": 57,
          "id": "executive.experimento",
          "what": "Core executive business profile for Experimento, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Experimento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Experimento"
          ]
        },
        {
          "displayNumber": 58,
          "id": "executive.hipotese",
          "what": "Core executive business profile for Hipotese, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Hipotese is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Hipotese"
          ]
        },
        {
          "displayNumber": 59,
          "id": "executive.benchmark",
          "what": "Core executive business profile for Benchmark, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Benchmark is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Benchmark"
          ]
        },
        {
          "displayNumber": 60,
          "id": "executive.concorrente",
          "what": "Core executive business profile for Concorrente, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Concorrente is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Concorrente"
          ]
        },
        {
          "displayNumber": 61,
          "id": "executive.diferencial",
          "what": "Core executive business profile for Diferencial, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Diferencial is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Diferencial"
          ]
        },
        {
          "displayNumber": 62,
          "id": "executive.proposta-valor",
          "what": "Core executive business profile for Proposta Valor, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Proposta Valor is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PropostaValor"
          ]
        },
        {
          "displayNumber": 63,
          "id": "executive.modelo-negocio",
          "what": "Core executive business profile for Modelo Negocio, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Modelo Negocio is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ModeloNegocio"
          ]
        },
        {
          "displayNumber": 64,
          "id": "executive.plano-estrategico",
          "what": "Core executive business profile for Plano Estrategico, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Plano Estrategico is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoEstrategico"
          ]
        },
        {
          "displayNumber": 65,
          "id": "executive.tese-estrategica",
          "what": "Core executive business profile for Tese Estrategica, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Tese Estrategica is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseEstrategica"
          ]
        },
        {
          "displayNumber": 66,
          "id": "executive.objetivo-estrategico",
          "what": "Core executive business profile for Objetivo Estrategico, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Objetivo Estrategico is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ObjetivoEstrategico"
          ]
        },
        {
          "displayNumber": 67,
          "id": "executive.resultado-chave",
          "what": "Core executive business profile for Resultado Chave, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Resultado Chave is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ResultadoChave"
          ]
        },
        {
          "displayNumber": 68,
          "id": "executive.portifolio",
          "what": "Core executive business profile for Portifolio, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Portifolio is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Portifolio"
          ]
        },
        {
          "displayNumber": 69,
          "id": "executive.programa",
          "what": "Core executive business profile for Programa, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Programa is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Programa"
          ]
        },
        {
          "displayNumber": 70,
          "id": "executive.workstream",
          "what": "Core executive business profile for Workstream, including identity, owner, lifecycle status, relationships, metrics, and evidence references.",
          "why": "Workstream is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Workstream"
          ]
        }
      ]
    },
    {
      "title": "Strategy, Portfolio & Product",
      "primaryCapabilityKinds": [
        "cap:profile",
        "cap:validator",
        "cap:asset",
        "cap:transformer"
      ],
      "description": "Strategic planning, market design, product management, experimentation, and roadmap concepts.",
      "entries": [
        {
          "displayNumber": 71,
          "id": "executive.milestone",
          "what": "Strategy, portfolio, market, product, or execution profile for Milestone, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Milestone is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Milestone"
          ]
        },
        {
          "displayNumber": 72,
          "id": "executive.entregavel",
          "what": "Strategy, portfolio, market, product, or execution profile for Entregavel, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Entregavel is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Entregavel"
          ]
        },
        {
          "displayNumber": 73,
          "id": "executive.dependencia",
          "what": "Strategy, portfolio, market, product, or execution profile for Dependencia, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Dependencia is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Dependencia"
          ]
        },
        {
          "displayNumber": 74,
          "id": "executive.bloqueio",
          "what": "Strategy, portfolio, market, product, or execution profile for Bloqueio, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Bloqueio is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Bloqueio"
          ]
        },
        {
          "displayNumber": 75,
          "id": "executive.premissa",
          "what": "Strategy, portfolio, market, product, or execution profile for Premissa, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Premissa is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Premissa"
          ]
        },
        {
          "displayNumber": 76,
          "id": "executive.restricao",
          "what": "Strategy, portfolio, market, product, or execution profile for Restricao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Restricao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Restricao"
          ]
        },
        {
          "displayNumber": 77,
          "id": "executive.escopo",
          "what": "Strategy, portfolio, market, product, or execution profile for Escopo, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Escopo is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Escopo"
          ]
        },
        {
          "displayNumber": 78,
          "id": "executive.requisito",
          "what": "Strategy, portfolio, market, product, or execution profile for Requisito, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Requisito is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Requisito"
          ]
        },
        {
          "displayNumber": 79,
          "id": "executive.caso-uso",
          "what": "Strategy, portfolio, market, product, or execution profile for Caso Uso, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Caso Uso is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CasoUso"
          ]
        },
        {
          "displayNumber": 80,
          "id": "executive.feature",
          "what": "Strategy, portfolio, market, product, or execution profile for Feature, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Feature is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Feature"
          ]
        },
        {
          "displayNumber": 81,
          "id": "executive.epico",
          "what": "Strategy, portfolio, market, product, or execution profile for Epico, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Epico is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Epico"
          ]
        },
        {
          "displayNumber": 82,
          "id": "executive.historia-usuario",
          "what": "Strategy, portfolio, market, product, or execution profile for Historia Usuario, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Historia Usuario is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HistoriaUsuario"
          ]
        },
        {
          "displayNumber": 83,
          "id": "executive.backlog",
          "what": "Strategy, portfolio, market, product, or execution profile for Backlog, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Backlog is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Backlog"
          ]
        },
        {
          "displayNumber": 84,
          "id": "executive.release",
          "what": "Strategy, portfolio, market, product, or execution profile for Release, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Release is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Release"
          ]
        },
        {
          "displayNumber": 85,
          "id": "executive.versao",
          "what": "Strategy, portfolio, market, product, or execution profile for Versao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Versao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Versao"
          ]
        },
        {
          "displayNumber": 86,
          "id": "executive.mudanca",
          "what": "Strategy, portfolio, market, product, or execution profile for Mudanca, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Mudanca is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Mudanca"
          ]
        },
        {
          "displayNumber": 87,
          "id": "executive.solicitacao-mudanca",
          "what": "Strategy, portfolio, market, product, or execution profile for Solicitacao Mudanca, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Solicitacao Mudanca is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SolicitacaoMudanca"
          ]
        },
        {
          "displayNumber": 88,
          "id": "executive.aprovacao",
          "what": "Strategy, portfolio, market, product, or execution profile for Aprovacao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Aprovacao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Aprovacao"
          ]
        },
        {
          "displayNumber": 89,
          "id": "executive.governanca",
          "what": "Strategy, portfolio, market, product, or execution profile for Governanca, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Governanca is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Governanca"
          ]
        },
        {
          "displayNumber": 90,
          "id": "executive.politica",
          "what": "Strategy, portfolio, market, product, or execution profile for Politica, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Politica is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Politica"
          ]
        },
        {
          "displayNumber": 91,
          "id": "executive.procedimento",
          "what": "Strategy, portfolio, market, product, or execution profile for Procedimento, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Procedimento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Procedimento"
          ]
        },
        {
          "displayNumber": 92,
          "id": "executive.norma",
          "what": "Strategy, portfolio, market, product, or execution profile for Norma, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Norma is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Norma"
          ]
        },
        {
          "displayNumber": 93,
          "id": "executive.controle",
          "what": "Strategy, portfolio, market, product, or execution profile for Controle, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Controle is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Controle"
          ]
        },
        {
          "displayNumber": 94,
          "id": "executive.auditoria",
          "what": "Strategy, portfolio, market, product, or execution profile for Auditoria, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Auditoria is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Auditoria"
          ]
        },
        {
          "displayNumber": 95,
          "id": "executive.evidencia",
          "what": "Strategy, portfolio, market, product, or execution profile for Evidencia, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Evidencia is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:asset"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Evidencia"
          ]
        },
        {
          "displayNumber": 96,
          "id": "executive.conformidade",
          "what": "Strategy, portfolio, market, product, or execution profile for Conformidade, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Conformidade is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Conformidade"
          ]
        },
        {
          "displayNumber": 97,
          "id": "executive.excecao",
          "what": "Strategy, portfolio, market, product, or execution profile for Excecao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Excecao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Excecao"
          ]
        },
        {
          "displayNumber": 98,
          "id": "executive.incidente",
          "what": "Strategy, portfolio, market, product, or execution profile for Incidente, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Incidente is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Incidente"
          ]
        },
        {
          "displayNumber": 99,
          "id": "executive.problema",
          "what": "Strategy, portfolio, market, product, or execution profile for Problema, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Problema is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Problema"
          ]
        },
        {
          "displayNumber": 100,
          "id": "executive.causa-raiz",
          "what": "Strategy, portfolio, market, product, or execution profile for Causa Raiz, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Causa Raiz is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CausaRaiz"
          ]
        },
        {
          "displayNumber": 101,
          "id": "executive.licao-aprendida",
          "what": "Strategy, portfolio, market, product, or execution profile for Licao Aprendida, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Licao Aprendida is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: LicaoAprendida"
          ]
        },
        {
          "displayNumber": 102,
          "id": "executive.postmortem",
          "what": "Strategy, portfolio, market, product, or execution profile for Postmortem, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Postmortem is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Postmortem"
          ]
        },
        {
          "displayNumber": 103,
          "id": "executive.continuidade-negocio",
          "what": "Strategy, portfolio, market, product, or execution profile for Continuidade Negocio, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Continuidade Negocio is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContinuidadeNegocio"
          ]
        },
        {
          "displayNumber": 104,
          "id": "executive.plano-contingencia",
          "what": "Strategy, portfolio, market, product, or execution profile for Plano Contingencia, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Plano Contingencia is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoContingencia"
          ]
        },
        {
          "displayNumber": 105,
          "id": "executive.plano-recuperacao",
          "what": "Strategy, portfolio, market, product, or execution profile for Plano Recuperacao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Plano Recuperacao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoRecuperacao"
          ]
        },
        {
          "displayNumber": 106,
          "id": "executive.sla",
          "what": "Strategy, portfolio, market, product, or execution profile for SLA, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "SLA is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SLA"
          ]
        },
        {
          "displayNumber": 107,
          "id": "executive.ola",
          "what": "Strategy, portfolio, market, product, or execution profile for OLA, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "OLA is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: OLA"
          ]
        },
        {
          "displayNumber": 108,
          "id": "executive.slo",
          "what": "Strategy, portfolio, market, product, or execution profile for SLO, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "SLO is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SLO"
          ]
        },
        {
          "displayNumber": 109,
          "id": "executive.sli",
          "what": "Strategy, portfolio, market, product, or execution profile for SLI, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "SLI is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SLI"
          ]
        },
        {
          "displayNumber": 110,
          "id": "executive.capacidade",
          "what": "Strategy, portfolio, market, product, or execution profile for Capacidade, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Capacidade is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Capacidade"
          ]
        },
        {
          "displayNumber": 111,
          "id": "executive.disponibilidade",
          "what": "Strategy, portfolio, market, product, or execution profile for Disponibilidade, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Disponibilidade is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Disponibilidade"
          ]
        },
        {
          "displayNumber": 112,
          "id": "executive.performance",
          "what": "Strategy, portfolio, market, product, or execution profile for Performance, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Performance is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Performance"
          ]
        },
        {
          "displayNumber": 113,
          "id": "executive.qualidade",
          "what": "Strategy, portfolio, market, product, or execution profile for Qualidade, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Qualidade is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Qualidade"
          ]
        },
        {
          "displayNumber": 114,
          "id": "executive.satisfacao",
          "what": "Strategy, portfolio, market, product, or execution profile for Satisfacao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Satisfacao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Satisfacao"
          ]
        },
        {
          "displayNumber": 115,
          "id": "executive.experiencia-cliente",
          "what": "Strategy, portfolio, market, product, or execution profile for Experiencia Cliente, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Experiencia Cliente is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ExperienciaCliente"
          ]
        },
        {
          "displayNumber": 116,
          "id": "executive.retencao",
          "what": "Strategy, portfolio, market, product, or execution profile for Retencao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Retencao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Retencao"
          ]
        },
        {
          "displayNumber": 117,
          "id": "executive.expansao",
          "what": "Strategy, portfolio, market, product, or execution profile for Expansao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Expansao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Expansao"
          ]
        },
        {
          "displayNumber": 118,
          "id": "executive.cross-sell",
          "what": "Strategy, portfolio, market, product, or execution profile for Cross Sell, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Cross Sell is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CrossSell"
          ]
        },
        {
          "displayNumber": 119,
          "id": "executive.up-sell",
          "what": "Strategy, portfolio, market, product, or execution profile for Up Sell, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Up Sell is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: UpSell"
          ]
        },
        {
          "displayNumber": 120,
          "id": "executive.renovacao",
          "what": "Strategy, portfolio, market, product, or execution profile for Renovacao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Renovacao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Renovacao"
          ]
        },
        {
          "displayNumber": 121,
          "id": "executive.cancelamento",
          "what": "Strategy, portfolio, market, product, or execution profile for Cancelamento, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Cancelamento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Cancelamento"
          ]
        },
        {
          "displayNumber": 122,
          "id": "executive.reclamacao",
          "what": "Strategy, portfolio, market, product, or execution profile for Reclamacao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Reclamacao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Reclamacao"
          ]
        },
        {
          "displayNumber": 123,
          "id": "executive.solicitacao",
          "what": "Strategy, portfolio, market, product, or execution profile for Solicitacao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Solicitacao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Solicitacao"
          ]
        },
        {
          "displayNumber": 124,
          "id": "executive.ticket",
          "what": "Strategy, portfolio, market, product, or execution profile for Ticket, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Ticket is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Ticket"
          ]
        },
        {
          "displayNumber": 125,
          "id": "executive.atendimento",
          "what": "Strategy, portfolio, market, product, or execution profile for Atendimento, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Atendimento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Atendimento"
          ]
        },
        {
          "displayNumber": 126,
          "id": "executive.base-conhecimento",
          "what": "Strategy, portfolio, market, product, or execution profile for Base Conhecimento, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Base Conhecimento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: BaseConhecimento"
          ]
        },
        {
          "displayNumber": 127,
          "id": "executive.artigo",
          "what": "Strategy, portfolio, market, product, or execution profile for Artigo, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Artigo is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Artigo"
          ]
        },
        {
          "displayNumber": 128,
          "id": "executive.faq",
          "what": "Strategy, portfolio, market, product, or execution profile for FAQ, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "FAQ is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: FAQ"
          ]
        },
        {
          "displayNumber": 129,
          "id": "executive.treinamento",
          "what": "Strategy, portfolio, market, product, or execution profile for Treinamento, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Treinamento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Treinamento"
          ]
        },
        {
          "displayNumber": 130,
          "id": "executive.certificacao",
          "what": "Strategy, portfolio, market, product, or execution profile for Certificacao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Certificacao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Certificacao"
          ]
        },
        {
          "displayNumber": 131,
          "id": "executive.competencia",
          "what": "Strategy, portfolio, market, product, or execution profile for Competencia, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Competencia is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Competencia"
          ]
        },
        {
          "displayNumber": 132,
          "id": "executive.habilidade",
          "what": "Strategy, portfolio, market, product, or execution profile for Habilidade, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Habilidade is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Habilidade"
          ]
        },
        {
          "displayNumber": 133,
          "id": "executive.plano-desenvolvimento",
          "what": "Strategy, portfolio, market, product, or execution profile for Plano Desenvolvimento, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Plano Desenvolvimento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoDesenvolvimento"
          ]
        },
        {
          "displayNumber": 134,
          "id": "executive.avaliacao-desempenho",
          "what": "Strategy, portfolio, market, product, or execution profile for Avaliacao Desempenho, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Avaliacao Desempenho is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AvaliacaoDesempenho"
          ]
        },
        {
          "displayNumber": 135,
          "id": "executive.feedback",
          "what": "Strategy, portfolio, market, product, or execution profile for Feedback, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Feedback is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Feedback"
          ]
        },
        {
          "displayNumber": 136,
          "id": "executive.remuneracao",
          "what": "Strategy, portfolio, market, product, or execution profile for Remuneracao, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Remuneracao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Remuneracao"
          ]
        },
        {
          "displayNumber": 137,
          "id": "executive.beneficio",
          "what": "Strategy, portfolio, market, product, or execution profile for Beneficio, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Beneficio is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Beneficio"
          ]
        },
        {
          "displayNumber": 138,
          "id": "executive.vaga",
          "what": "Strategy, portfolio, market, product, or execution profile for Vaga, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Vaga is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Vaga"
          ]
        },
        {
          "displayNumber": 139,
          "id": "executive.candidato",
          "what": "Strategy, portfolio, market, product, or execution profile for Candidato, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Candidato is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Candidato"
          ]
        },
        {
          "displayNumber": 140,
          "id": "executive.processo-seletivo",
          "what": "Strategy, portfolio, market, product, or execution profile for Processo Seletivo, including intent, assumptions, priority, dependencies, expected value, and decision evidence.",
          "why": "Processo Seletivo is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ProcessoSeletivo"
          ]
        }
      ]
    },
    {
      "title": "Governance, Risk, Compliance & Legal",
      "primaryCapabilityKinds": [
        "cap:profile",
        "cap:validator",
        "cap:transformer"
      ],
      "description": "Governance bodies, policies, controls, audit evidence, regulatory obligations, risk and compliance primitives.",
      "entries": [
        {
          "displayNumber": 141,
          "id": "executive.admissao",
          "what": "Governance, risk, compliance, or legal profile for Admissao, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Admissao is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Admissao"
          ]
        },
        {
          "displayNumber": 142,
          "id": "executive.desligamento",
          "what": "Governance, risk, compliance, or legal profile for Desligamento, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Desligamento is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Desligamento"
          ]
        },
        {
          "displayNumber": 143,
          "id": "executive.onboarding",
          "what": "Governance, risk, compliance, or legal profile for Onboarding, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Onboarding is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Onboarding"
          ]
        },
        {
          "displayNumber": 144,
          "id": "executive.offboarding",
          "what": "Governance, risk, compliance, or legal profile for Offboarding, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Offboarding is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Offboarding"
          ]
        },
        {
          "displayNumber": 145,
          "id": "executive.headcount",
          "what": "Governance, risk, compliance, or legal profile for Headcount, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Headcount is a load-bearing business primitive that executives routinely need for planning, accountability, performance review, and cross-functional coordination.",
          "tier": "S",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Headcount"
          ]
        },
        {
          "displayNumber": 146,
          "id": "executive.alocacao",
          "what": "Governance, risk, compliance, or legal profile for Alocacao, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Alocacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Alocacao"
          ]
        },
        {
          "displayNumber": 147,
          "id": "executive.capacidade-equipe",
          "what": "Governance, risk, compliance, or legal profile for Capacidade Equipe, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Capacidade Equipe is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CapacidadeEquipe"
          ]
        },
        {
          "displayNumber": 148,
          "id": "executive.ordem-compra",
          "what": "Governance, risk, compliance, or legal profile for Ordem Compra, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Ordem Compra is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: OrdemCompra"
          ]
        },
        {
          "displayNumber": 149,
          "id": "executive.cotacao",
          "what": "Governance, risk, compliance, or legal profile for Cotacao, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Cotacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Cotacao"
          ]
        },
        {
          "displayNumber": 150,
          "id": "executive.requisicao-compra",
          "what": "Governance, risk, compliance, or legal profile for Requisicao Compra, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Requisicao Compra is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RequisicaoCompra"
          ]
        },
        {
          "displayNumber": 151,
          "id": "executive.aprovacao-compra",
          "what": "Governance, risk, compliance, or legal profile for Aprovacao Compra, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Aprovacao Compra is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AprovacaoCompra"
          ]
        },
        {
          "displayNumber": 152,
          "id": "executive.contrato-fornecedor",
          "what": "Governance, risk, compliance, or legal profile for Contrato Fornecedor, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Contrato Fornecedor is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContratoFornecedor"
          ]
        },
        {
          "displayNumber": 153,
          "id": "executive.slafornecedor",
          "what": "Governance, risk, compliance, or legal profile for SLAFornecedor, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "SLAFornecedor is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SLAFornecedor"
          ]
        },
        {
          "displayNumber": 154,
          "id": "executive.risco-fornecedor",
          "what": "Governance, risk, compliance, or legal profile for Risco Fornecedor, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Risco Fornecedor is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RiscoFornecedor"
          ]
        },
        {
          "displayNumber": 155,
          "id": "executive.avaliacao-fornecedor",
          "what": "Governance, risk, compliance, or legal profile for Avaliacao Fornecedor, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Avaliacao Fornecedor is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AvaliacaoFornecedor"
          ]
        },
        {
          "displayNumber": 156,
          "id": "executive.inventario",
          "what": "Governance, risk, compliance, or legal profile for Inventario, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Inventario is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Inventario"
          ]
        },
        {
          "displayNumber": 157,
          "id": "executive.ativo",
          "what": "Governance, risk, compliance, or legal profile for Ativo, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Ativo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Ativo"
          ]
        },
        {
          "displayNumber": 158,
          "id": "executive.equipamento",
          "what": "Governance, risk, compliance, or legal profile for Equipamento, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Equipamento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Equipamento"
          ]
        },
        {
          "displayNumber": 159,
          "id": "executive.licenca",
          "what": "Governance, risk, compliance, or legal profile for Licenca, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Licenca is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Licenca"
          ]
        },
        {
          "displayNumber": 160,
          "id": "executive.assinatura",
          "what": "Governance, risk, compliance, or legal profile for Assinatura, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Assinatura is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Assinatura"
          ]
        },
        {
          "displayNumber": 161,
          "id": "executive.renovacao-contrato",
          "what": "Governance, risk, compliance, or legal profile for Renovacao Contrato, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Renovacao Contrato is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RenovacaoContrato"
          ]
        },
        {
          "displayNumber": 162,
          "id": "executive.garantia",
          "what": "Governance, risk, compliance, or legal profile for Garantia, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Garantia is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Garantia"
          ]
        },
        {
          "displayNumber": 163,
          "id": "executive.manutencao",
          "what": "Governance, risk, compliance, or legal profile for Manutencao, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Manutencao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Manutencao"
          ]
        },
        {
          "displayNumber": 164,
          "id": "executive.estoque",
          "what": "Governance, risk, compliance, or legal profile for Estoque, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Estoque is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Estoque"
          ]
        },
        {
          "displayNumber": 165,
          "id": "executive.movimentacao-estoque",
          "what": "Governance, risk, compliance, or legal profile for Movimentacao Estoque, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Movimentacao Estoque is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MovimentacaoEstoque"
          ]
        },
        {
          "displayNumber": 166,
          "id": "executive.localizacao",
          "what": "Governance, risk, compliance, or legal profile for Localizacao, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Localizacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Localizacao"
          ]
        },
        {
          "displayNumber": 167,
          "id": "executive.filial",
          "what": "Governance, risk, compliance, or legal profile for Filial, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Filial is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Filial"
          ]
        },
        {
          "displayNumber": 168,
          "id": "executive.regiao",
          "what": "Governance, risk, compliance, or legal profile for Regiao, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Regiao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Regiao"
          ]
        },
        {
          "displayNumber": 169,
          "id": "executive.territorio",
          "what": "Governance, risk, compliance, or legal profile for Territorio, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Territorio is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Territorio"
          ]
        },
        {
          "displayNumber": 170,
          "id": "executive.rota",
          "what": "Governance, risk, compliance, or legal profile for Rota, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Rota is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Rota"
          ]
        },
        {
          "displayNumber": 171,
          "id": "executive.entrega",
          "what": "Governance, risk, compliance, or legal profile for Entrega, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Entrega is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Entrega"
          ]
        },
        {
          "displayNumber": 172,
          "id": "executive.logistica",
          "what": "Governance, risk, compliance, or legal profile for Logistica, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Logistica is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Logistica"
          ]
        },
        {
          "displayNumber": 173,
          "id": "executive.transportadora",
          "what": "Governance, risk, compliance, or legal profile for Transportadora, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Transportadora is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Transportadora"
          ]
        },
        {
          "displayNumber": 174,
          "id": "executive.frete",
          "what": "Governance, risk, compliance, or legal profile for Frete, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Frete is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Frete"
          ]
        },
        {
          "displayNumber": 175,
          "id": "executive.prazo-entrega",
          "what": "Governance, risk, compliance, or legal profile for Prazo Entrega, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Prazo Entrega is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PrazoEntrega"
          ]
        },
        {
          "displayNumber": 176,
          "id": "executive.devolucao",
          "what": "Governance, risk, compliance, or legal profile for Devolucao, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Devolucao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Devolucao"
          ]
        },
        {
          "displayNumber": 177,
          "id": "executive.troca",
          "what": "Governance, risk, compliance, or legal profile for Troca, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Troca is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Troca"
          ]
        },
        {
          "displayNumber": 178,
          "id": "executive.rma",
          "what": "Governance, risk, compliance, or legal profile for RMA, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "RMA is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RMA"
          ]
        },
        {
          "displayNumber": 179,
          "id": "executive.ordem-servico",
          "what": "Governance, risk, compliance, or legal profile for Ordem Servico, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Ordem Servico is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: OrdemServico"
          ]
        },
        {
          "displayNumber": 180,
          "id": "executive.servico-executado",
          "what": "Governance, risk, compliance, or legal profile for Servico Executado, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Servico Executado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ServicoExecutado"
          ]
        },
        {
          "displayNumber": 181,
          "id": "executive.agenda",
          "what": "Governance, risk, compliance, or legal profile for Agenda, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Agenda is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Agenda"
          ]
        },
        {
          "displayNumber": 182,
          "id": "executive.calendario",
          "what": "Governance, risk, compliance, or legal profile for Calendario, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Calendario is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Calendario"
          ]
        },
        {
          "displayNumber": 183,
          "id": "executive.evento",
          "what": "Governance, risk, compliance, or legal profile for Evento, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Evento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Evento"
          ]
        },
        {
          "displayNumber": 184,
          "id": "executive.workshop",
          "what": "Governance, risk, compliance, or legal profile for Workshop, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Workshop is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Workshop"
          ]
        },
        {
          "displayNumber": 185,
          "id": "executive.comite",
          "what": "Governance, risk, compliance, or legal profile for Comite, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Comite is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Comite"
          ]
        },
        {
          "displayNumber": 186,
          "id": "executive.pauta",
          "what": "Governance, risk, compliance, or legal profile for Pauta, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Pauta is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Pauta"
          ]
        },
        {
          "displayNumber": 187,
          "id": "executive.ata",
          "what": "Governance, risk, compliance, or legal profile for Ata, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Ata is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Ata"
          ]
        },
        {
          "displayNumber": 188,
          "id": "executive.participante",
          "what": "Governance, risk, compliance, or legal profile for Participante, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Participante is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Participante"
          ]
        },
        {
          "displayNumber": 189,
          "id": "executive.responsavel",
          "what": "Governance, risk, compliance, or legal profile for Responsavel, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Responsavel is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Responsavel"
          ]
        },
        {
          "displayNumber": 190,
          "id": "executive.stakeholder",
          "what": "Governance, risk, compliance, or legal profile for Stakeholder, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Stakeholder is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Stakeholder"
          ]
        },
        {
          "displayNumber": 191,
          "id": "executive.sponsor",
          "what": "Governance, risk, compliance, or legal profile for Sponsor, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Sponsor is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Sponsor"
          ]
        },
        {
          "displayNumber": 192,
          "id": "executive.owner",
          "what": "Governance, risk, compliance, or legal profile for Owner, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Owner is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Owner"
          ]
        },
        {
          "displayNumber": 193,
          "id": "executive.aprovador",
          "what": "Governance, risk, compliance, or legal profile for Aprovador, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Aprovador is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Aprovador"
          ]
        },
        {
          "displayNumber": 194,
          "id": "executive.contato-comercial",
          "what": "Governance, risk, compliance, or legal profile for Contato Comercial, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Contato Comercial is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContatoComercial"
          ]
        },
        {
          "displayNumber": 195,
          "id": "executive.contato-tecnico",
          "what": "Governance, risk, compliance, or legal profile for Contato Tecnico, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Contato Tecnico is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContatoTecnico"
          ]
        },
        {
          "displayNumber": 196,
          "id": "executive.contato-financeiro",
          "what": "Governance, risk, compliance, or legal profile for Contato Financeiro, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Contato Financeiro is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContatoFinanceiro"
          ]
        },
        {
          "displayNumber": 197,
          "id": "executive.conta-receber",
          "what": "Governance, risk, compliance, or legal profile for Conta Receber, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Conta Receber is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContaReceber"
          ]
        },
        {
          "displayNumber": 198,
          "id": "executive.conta-pagar",
          "what": "Governance, risk, compliance, or legal profile for Conta Pagar, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Conta Pagar is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContaPagar"
          ]
        },
        {
          "displayNumber": 199,
          "id": "executive.fluxo-caixa",
          "what": "Governance, risk, compliance, or legal profile for Fluxo Caixa, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Fluxo Caixa is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: FluxoCaixa"
          ]
        },
        {
          "displayNumber": 200,
          "id": "executive.lancamento-financeiro",
          "what": "Governance, risk, compliance, or legal profile for Lancamento Financeiro, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Lancamento Financeiro is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: LancamentoFinanceiro"
          ]
        },
        {
          "displayNumber": 201,
          "id": "executive.centro-lucro",
          "what": "Governance, risk, compliance, or legal profile for Centro Lucro, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Centro Lucro is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CentroLucro"
          ]
        },
        {
          "displayNumber": 202,
          "id": "executive.plano-contas",
          "what": "Governance, risk, compliance, or legal profile for Plano Contas, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Plano Contas is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoContas"
          ]
        },
        {
          "displayNumber": 203,
          "id": "executive.nota-fiscal",
          "what": "Governance, risk, compliance, or legal profile for Nota Fiscal, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Nota Fiscal is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: NotaFiscal"
          ]
        },
        {
          "displayNumber": 204,
          "id": "executive.imposto",
          "what": "Governance, risk, compliance, or legal profile for Imposto, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Imposto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Imposto"
          ]
        },
        {
          "displayNumber": 205,
          "id": "executive.tributo",
          "what": "Governance, risk, compliance, or legal profile for Tributo, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Tributo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Tributo"
          ]
        },
        {
          "displayNumber": 206,
          "id": "executive.credito",
          "what": "Governance, risk, compliance, or legal profile for Credito, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Credito is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Credito"
          ]
        },
        {
          "displayNumber": 207,
          "id": "executive.debito",
          "what": "Governance, risk, compliance, or legal profile for Debito, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Debito is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Debito"
          ]
        },
        {
          "displayNumber": 208,
          "id": "executive.cobranca",
          "what": "Governance, risk, compliance, or legal profile for Cobranca, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Cobranca is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Cobranca"
          ]
        },
        {
          "displayNumber": 209,
          "id": "executive.inadimplencia",
          "what": "Governance, risk, compliance, or legal profile for Inadimplencia, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Inadimplencia is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Inadimplencia"
          ]
        },
        {
          "displayNumber": 210,
          "id": "executive.provisionamento",
          "what": "Governance, risk, compliance, or legal profile for Provisionamento, including accountable owner, scope, controls, evidence, exceptions, and lifecycle state.",
          "why": "Provisionamento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Provisionamento"
          ]
        }
      ]
    },
    {
      "title": "Finance, Revenue & Unit Economics",
      "primaryCapabilityKinds": [
        "cap:profile",
        "cap:transformer",
        "cap:validator",
        "cap:asset"
      ],
      "description": "Financial planning, revenue, cost, accounting, treasury, valuation, and commercial metrics.",
      "entries": [
        {
          "displayNumber": 211,
          "id": "executive.reserva",
          "what": "Enterprise finance profile for Reserva, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Reserva is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Reserva"
          ]
        },
        {
          "displayNumber": 212,
          "id": "executive.alocacao-custo",
          "what": "Enterprise finance profile for Alocacao Custo, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Alocacao Custo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AlocacaoCusto"
          ]
        },
        {
          "displayNumber": 213,
          "id": "executive.rateio",
          "what": "Enterprise finance profile for Rateio, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Rateio is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Rateio"
          ]
        },
        {
          "displayNumber": 214,
          "id": "executive.margem-bruta",
          "what": "Enterprise finance profile for Margem Bruta, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Margem Bruta is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MargemBruta"
          ]
        },
        {
          "displayNumber": 215,
          "id": "executive.margem-liquida",
          "what": "Enterprise finance profile for Margem Liquida, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Margem Liquida is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MargemLiquida"
          ]
        },
        {
          "displayNumber": 216,
          "id": "executive.ebitda",
          "what": "Enterprise finance profile for EBITDA, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "EBITDA is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: EBITDA"
          ]
        },
        {
          "displayNumber": 217,
          "id": "executive.lucro",
          "what": "Enterprise finance profile for Lucro, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Lucro is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Lucro"
          ]
        },
        {
          "displayNumber": 218,
          "id": "executive.prejuizo",
          "what": "Enterprise finance profile for Prejuizo, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Prejuizo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Prejuizo"
          ]
        },
        {
          "displayNumber": 219,
          "id": "executive.receita-recorrente",
          "what": "Enterprise finance profile for Receita Recorrente, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Receita Recorrente is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ReceitaRecorrente"
          ]
        },
        {
          "displayNumber": 220,
          "id": "executive.mrr",
          "what": "Enterprise finance profile for MRR, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "MRR is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MRR"
          ]
        },
        {
          "displayNumber": 221,
          "id": "executive.arr",
          "what": "Enterprise finance profile for ARR, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "ARR is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ARR"
          ]
        },
        {
          "displayNumber": 222,
          "id": "executive.cac",
          "what": "Enterprise finance profile for CAC, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "CAC is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CAC"
          ]
        },
        {
          "displayNumber": 223,
          "id": "executive.ltv",
          "what": "Enterprise finance profile for LTV, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "LTV is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: LTV"
          ]
        },
        {
          "displayNumber": 224,
          "id": "executive.payback",
          "what": "Enterprise finance profile for Payback, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Payback is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Payback"
          ]
        },
        {
          "displayNumber": 225,
          "id": "executive.burn-rate",
          "what": "Enterprise finance profile for Burn Rate, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Burn Rate is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: BurnRate"
          ]
        },
        {
          "displayNumber": 226,
          "id": "executive.runway",
          "what": "Enterprise finance profile for Runway, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Runway is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Runway"
          ]
        },
        {
          "displayNumber": 227,
          "id": "executive.unit-economics",
          "what": "Enterprise finance profile for Unit Economics, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Unit Economics is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: UnitEconomics"
          ]
        },
        {
          "displayNumber": 228,
          "id": "executive.cohort",
          "what": "Enterprise finance profile for Cohort, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Cohort is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Cohort"
          ]
        },
        {
          "displayNumber": 229,
          "id": "executive.funil",
          "what": "Enterprise finance profile for Funil, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Funil is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Funil"
          ]
        },
        {
          "displayNumber": 230,
          "id": "executive.conversao",
          "what": "Enterprise finance profile for Conversao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Conversao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Conversao"
          ]
        },
        {
          "displayNumber": 231,
          "id": "executive.taxa-conversao",
          "what": "Enterprise finance profile for Taxa Conversao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Taxa Conversao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TaxaConversao"
          ]
        },
        {
          "displayNumber": 232,
          "id": "executive.origem-lead",
          "what": "Enterprise finance profile for Origem Lead, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Origem Lead is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: OrigemLead"
          ]
        },
        {
          "displayNumber": 233,
          "id": "executive.fonte-receita",
          "what": "Enterprise finance profile for Fonte Receita, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Fonte Receita is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: FonteReceita"
          ]
        },
        {
          "displayNumber": 234,
          "id": "executive.ticket-medio",
          "what": "Enterprise finance profile for Ticket Medio, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Ticket Medio is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TicketMedio"
          ]
        },
        {
          "displayNumber": 235,
          "id": "executive.volume-vendas",
          "what": "Enterprise finance profile for Volume Vendas, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Volume Vendas is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: VolumeVendas"
          ]
        },
        {
          "displayNumber": 236,
          "id": "executive.quota",
          "what": "Enterprise finance profile for Quota, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Quota is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Quota"
          ]
        },
        {
          "displayNumber": 237,
          "id": "executive.territorio-vendas",
          "what": "Enterprise finance profile for Territorio Vendas, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Territorio Vendas is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TerritorioVendas"
          ]
        },
        {
          "displayNumber": 238,
          "id": "executive.comissao",
          "what": "Enterprise finance profile for Comissao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Comissao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Comissao"
          ]
        },
        {
          "displayNumber": 239,
          "id": "executive.projecao",
          "what": "Enterprise finance profile for Projecao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Projecao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Projecao"
          ]
        },
        {
          "displayNumber": 240,
          "id": "executive.planejamento",
          "what": "Enterprise finance profile for Planejamento, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Planejamento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Planejamento"
          ]
        },
        {
          "displayNumber": 241,
          "id": "executive.orcamento-anual",
          "what": "Enterprise finance profile for Orcamento Anual, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Orcamento Anual is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: OrcamentoAnual"
          ]
        },
        {
          "displayNumber": 242,
          "id": "executive.budget",
          "what": "Enterprise finance profile for Budget, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Budget is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Budget"
          ]
        },
        {
          "displayNumber": 243,
          "id": "executive.realizado",
          "what": "Enterprise finance profile for Realizado, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Realizado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Realizado"
          ]
        },
        {
          "displayNumber": 244,
          "id": "executive.previsto",
          "what": "Enterprise finance profile for Previsto, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Previsto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Previsto"
          ]
        },
        {
          "displayNumber": 245,
          "id": "executive.desvio",
          "what": "Enterprise finance profile for Desvio, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Desvio is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Desvio"
          ]
        },
        {
          "displayNumber": 246,
          "id": "executive.variancia",
          "what": "Enterprise finance profile for Variancia, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Variancia is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Variancia"
          ]
        },
        {
          "displayNumber": 247,
          "id": "executive.justificativa",
          "what": "Enterprise finance profile for Justificativa, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Justificativa is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Justificativa"
          ]
        },
        {
          "displayNumber": 248,
          "id": "executive.correcao",
          "what": "Enterprise finance profile for Correcao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Correcao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Correcao"
          ]
        },
        {
          "displayNumber": 249,
          "id": "executive.plano-mitigacao",
          "what": "Enterprise finance profile for Plano Mitigacao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Plano Mitigacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoMitigacao"
          ]
        },
        {
          "displayNumber": 250,
          "id": "executive.impacto",
          "what": "Enterprise finance profile for Impacto, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Impacto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Impacto"
          ]
        },
        {
          "displayNumber": 251,
          "id": "executive.probabilidade",
          "what": "Enterprise finance profile for Probabilidade, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Probabilidade is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Probabilidade"
          ]
        },
        {
          "displayNumber": 252,
          "id": "executive.severidade",
          "what": "Enterprise finance profile for Severidade, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Severidade is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Severidade"
          ]
        },
        {
          "displayNumber": 253,
          "id": "executive.criticidade",
          "what": "Enterprise finance profile for Criticidade, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Criticidade is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Criticidade"
          ]
        },
        {
          "displayNumber": 254,
          "id": "executive.matriz-risco",
          "what": "Enterprise finance profile for Matriz Risco, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Matriz Risco is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MatrizRisco"
          ]
        },
        {
          "displayNumber": 255,
          "id": "executive.registro-risco",
          "what": "Enterprise finance profile for Registro Risco, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Registro Risco is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RegistroRisco"
          ]
        },
        {
          "displayNumber": 256,
          "id": "executive.controle-interno",
          "what": "Enterprise finance profile for Controle Interno, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Controle Interno is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ControleInterno"
          ]
        },
        {
          "displayNumber": 257,
          "id": "executive.teste-controle",
          "what": "Enterprise finance profile for Teste Controle, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Teste Controle is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TesteControle"
          ]
        },
        {
          "displayNumber": 258,
          "id": "executive.achado-auditoria",
          "what": "Enterprise finance profile for Achado Auditoria, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Achado Auditoria is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AchadoAuditoria"
          ]
        },
        {
          "displayNumber": 259,
          "id": "executive.recomendacao",
          "what": "Enterprise finance profile for Recomendacao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Recomendacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Recomendacao"
          ]
        },
        {
          "displayNumber": 260,
          "id": "executive.plano-remediacao",
          "what": "Enterprise finance profile for Plano Remediacao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Plano Remediacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoRemediacao"
          ]
        },
        {
          "displayNumber": 261,
          "id": "executive.dono-controle",
          "what": "Enterprise finance profile for Dono Controle, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Dono Controle is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: DonoControle"
          ]
        },
        {
          "displayNumber": 262,
          "id": "executive.evidencia-controle",
          "what": "Enterprise finance profile for Evidencia Controle, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Evidencia Controle is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator",
            "cap:asset"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: EvidenciaControle"
          ]
        },
        {
          "displayNumber": 263,
          "id": "executive.regulacao",
          "what": "Enterprise finance profile for Regulacao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Regulacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Regulacao"
          ]
        },
        {
          "displayNumber": 264,
          "id": "executive.obrigacao-legal",
          "what": "Enterprise finance profile for Obrigacao Legal, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Obrigacao Legal is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ObrigacaoLegal"
          ]
        },
        {
          "displayNumber": 265,
          "id": "executive.prazo-legal",
          "what": "Enterprise finance profile for Prazo Legal, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Prazo Legal is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PrazoLegal"
          ]
        },
        {
          "displayNumber": 266,
          "id": "executive.documento",
          "what": "Enterprise finance profile for Documento, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Documento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:asset"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Documento"
          ]
        },
        {
          "displayNumber": 267,
          "id": "executive.arquivo",
          "what": "Enterprise finance profile for Arquivo, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Arquivo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:asset"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Arquivo"
          ]
        },
        {
          "displayNumber": 268,
          "id": "executive.anexo",
          "what": "Enterprise finance profile for Anexo, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Anexo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:asset"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Anexo"
          ]
        },
        {
          "displayNumber": 269,
          "id": "executive.versao-documento",
          "what": "Enterprise finance profile for Versao Documento, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Versao Documento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:asset"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: VersaoDocumento"
          ]
        },
        {
          "displayNumber": 270,
          "id": "executive.historico-alteracao",
          "what": "Enterprise finance profile for Historico Alteracao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Historico Alteracao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HistoricoAlteracao"
          ]
        },
        {
          "displayNumber": 271,
          "id": "executive.aprovacao-documento",
          "what": "Enterprise finance profile for Aprovacao Documento, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Aprovacao Documento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:asset"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AprovacaoDocumento"
          ]
        },
        {
          "displayNumber": 272,
          "id": "executive.publicacao",
          "what": "Enterprise finance profile for Publicacao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Publicacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Publicacao"
          ]
        },
        {
          "displayNumber": 273,
          "id": "executive.comunicado",
          "what": "Enterprise finance profile for Comunicado, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Comunicado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Comunicado"
          ]
        },
        {
          "displayNumber": 274,
          "id": "executive.mensagem",
          "what": "Enterprise finance profile for Mensagem, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Mensagem is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Mensagem"
          ]
        },
        {
          "displayNumber": 275,
          "id": "executive.notificacao",
          "what": "Enterprise finance profile for Notificacao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Notificacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Notificacao"
          ]
        },
        {
          "displayNumber": 276,
          "id": "executive.alerta",
          "what": "Enterprise finance profile for Alerta, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Alerta is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Alerta"
          ]
        },
        {
          "displayNumber": 277,
          "id": "executive.escalacao",
          "what": "Enterprise finance profile for Escalacao, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Escalacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Escalacao"
          ]
        },
        {
          "displayNumber": 278,
          "id": "executive.transferencia",
          "what": "Enterprise finance profile for Transferencia, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Transferencia is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Transferencia"
          ]
        },
        {
          "displayNumber": 279,
          "id": "executive.solicitante",
          "what": "Enterprise finance profile for Solicitante, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Solicitante is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Solicitante"
          ]
        },
        {
          "displayNumber": 280,
          "id": "executive.beneficiario",
          "what": "Enterprise finance profile for Beneficiario, including ownership, period, value drivers, assumptions, status, evidence, and audit-ready references.",
          "why": "Beneficiario is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Beneficiario"
          ]
        }
      ]
    },
    {
      "title": "Customer, Sales, Marketing & Success",
      "primaryCapabilityKinds": [
        "cap:profile",
        "cap:validator",
        "cap:renderer",
        "cap:transformer"
      ],
      "description": "Demand generation, customer lifecycle, channels, sales execution, retention, support, and experience management.",
      "entries": [
        {
          "displayNumber": 281,
          "id": "executive.usuario",
          "what": "Commercial and customer-lifecycle profile for Usuario, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Usuario is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Usuario"
          ]
        },
        {
          "displayNumber": 282,
          "id": "executive.perfil",
          "what": "Commercial and customer-lifecycle profile for Perfil, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Perfil is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Perfil"
          ]
        },
        {
          "displayNumber": 283,
          "id": "executive.permissao",
          "what": "Commercial and customer-lifecycle profile for Permissao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Permissao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Permissao"
          ]
        },
        {
          "displayNumber": 284,
          "id": "executive.papel",
          "what": "Commercial and customer-lifecycle profile for Papel, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Papel is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Papel"
          ]
        },
        {
          "displayNumber": 285,
          "id": "executive.grupo-acesso",
          "what": "Commercial and customer-lifecycle profile for Grupo Acesso, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Grupo Acesso is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: GrupoAcesso"
          ]
        },
        {
          "displayNumber": 286,
          "id": "executive.identidade",
          "what": "Commercial and customer-lifecycle profile for Identidade, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Identidade is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Identidade"
          ]
        },
        {
          "displayNumber": 287,
          "id": "executive.sessao",
          "what": "Commercial and customer-lifecycle profile for Sessao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Sessao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Sessao"
          ]
        },
        {
          "displayNumber": 288,
          "id": "executive.autorizacao",
          "what": "Commercial and customer-lifecycle profile for Autorizacao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Autorizacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Autorizacao"
          ]
        },
        {
          "displayNumber": 289,
          "id": "executive.autenticacao",
          "what": "Commercial and customer-lifecycle profile for Autenticacao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Autenticacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Autenticacao"
          ]
        },
        {
          "displayNumber": 290,
          "id": "executive.consentimento",
          "what": "Commercial and customer-lifecycle profile for Consentimento, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Consentimento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Consentimento"
          ]
        },
        {
          "displayNumber": 291,
          "id": "executive.preferencia",
          "what": "Commercial and customer-lifecycle profile for Preferencia, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Preferencia is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Preferencia"
          ]
        },
        {
          "displayNumber": 292,
          "id": "executive.privacidade",
          "what": "Commercial and customer-lifecycle profile for Privacidade, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Privacidade is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Privacidade"
          ]
        },
        {
          "displayNumber": 293,
          "id": "executive.dado-pessoal",
          "what": "Commercial and customer-lifecycle profile for Dado Pessoal, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Dado Pessoal is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: DadoPessoal"
          ]
        },
        {
          "displayNumber": 294,
          "id": "executive.classificacao-dado",
          "what": "Commercial and customer-lifecycle profile for Classificacao Dado, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Classificacao Dado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ClassificacaoDado"
          ]
        },
        {
          "displayNumber": 295,
          "id": "executive.retencao-dado",
          "what": "Commercial and customer-lifecycle profile for Retencao Dado, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Retencao Dado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RetencaoDado"
          ]
        },
        {
          "displayNumber": 296,
          "id": "executive.base-legal",
          "what": "Commercial and customer-lifecycle profile for Base Legal, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Base Legal is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: BaseLegal"
          ]
        },
        {
          "displayNumber": 297,
          "id": "executive.tratamento-dado",
          "what": "Commercial and customer-lifecycle profile for Tratamento Dado, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Tratamento Dado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TratamentoDado"
          ]
        },
        {
          "displayNumber": 298,
          "id": "executive.processo-negocio",
          "what": "Commercial and customer-lifecycle profile for Processo Negocio, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Processo Negocio is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ProcessoNegocio"
          ]
        },
        {
          "displayNumber": 299,
          "id": "executive.fluxo-processo",
          "what": "Commercial and customer-lifecycle profile for Fluxo Processo, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Fluxo Processo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: FluxoProcesso"
          ]
        },
        {
          "displayNumber": 300,
          "id": "executive.etapa-processo",
          "what": "Commercial and customer-lifecycle profile for Etapa Processo, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Etapa Processo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: EtapaProcesso"
          ]
        },
        {
          "displayNumber": 301,
          "id": "executive.atividade",
          "what": "Commercial and customer-lifecycle profile for Atividade, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Atividade is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Atividade"
          ]
        },
        {
          "displayNumber": 302,
          "id": "executive.tarefa",
          "what": "Commercial and customer-lifecycle profile for Tarefa, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Tarefa is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Tarefa"
          ]
        },
        {
          "displayNumber": 303,
          "id": "executive.subtarefa",
          "what": "Commercial and customer-lifecycle profile for Subtarefa, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Subtarefa is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Subtarefa"
          ]
        },
        {
          "displayNumber": 304,
          "id": "executive.fila",
          "what": "Commercial and customer-lifecycle profile for Fila, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Fila is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Fila"
          ]
        },
        {
          "displayNumber": 305,
          "id": "executive.status",
          "what": "Commercial and customer-lifecycle profile for Status, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Status is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Status"
          ]
        },
        {
          "displayNumber": 306,
          "id": "executive.categoria",
          "what": "Commercial and customer-lifecycle profile for Categoria, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Categoria is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Categoria"
          ]
        },
        {
          "displayNumber": 307,
          "id": "executive.subcategoria",
          "what": "Commercial and customer-lifecycle profile for Subcategoria, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Subcategoria is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Subcategoria"
          ]
        },
        {
          "displayNumber": 308,
          "id": "executive.tipo",
          "what": "Commercial and customer-lifecycle profile for Tipo, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Tipo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Tipo"
          ]
        },
        {
          "displayNumber": 309,
          "id": "executive.prioridade-operacional",
          "what": "Commercial and customer-lifecycle profile for Prioridade Operacional, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Prioridade Operacional is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PrioridadeOperacional"
          ]
        },
        {
          "displayNumber": 310,
          "id": "executive.prazo",
          "what": "Commercial and customer-lifecycle profile for Prazo, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Prazo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Prazo"
          ]
        },
        {
          "displayNumber": 311,
          "id": "executive.data-inicio",
          "what": "Commercial and customer-lifecycle profile for Data Inicio, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Data Inicio is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: DataInicio"
          ]
        },
        {
          "displayNumber": 312,
          "id": "executive.data-fim",
          "what": "Commercial and customer-lifecycle profile for Data Fim, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Data Fim is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: DataFim"
          ]
        },
        {
          "displayNumber": 313,
          "id": "executive.duracao",
          "what": "Commercial and customer-lifecycle profile for Duracao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Duracao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Duracao"
          ]
        },
        {
          "displayNumber": 314,
          "id": "executive.esforco",
          "what": "Commercial and customer-lifecycle profile for Esforco, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Esforco is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Esforco"
          ]
        },
        {
          "displayNumber": 315,
          "id": "executive.complexidade",
          "what": "Commercial and customer-lifecycle profile for Complexidade, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Complexidade is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Complexidade"
          ]
        },
        {
          "displayNumber": 316,
          "id": "executive.valor",
          "what": "Commercial and customer-lifecycle profile for Valor, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Valor is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Valor"
          ]
        },
        {
          "displayNumber": 317,
          "id": "executive.roi",
          "what": "Commercial and customer-lifecycle profile for ROI, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "ROI is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ROI"
          ]
        },
        {
          "displayNumber": 318,
          "id": "executive.score",
          "what": "Commercial and customer-lifecycle profile for Score, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Score is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Score"
          ]
        },
        {
          "displayNumber": 319,
          "id": "executive.ranking",
          "what": "Commercial and customer-lifecycle profile for Ranking, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Ranking is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Ranking"
          ]
        },
        {
          "displayNumber": 320,
          "id": "executive.classificacao",
          "what": "Commercial and customer-lifecycle profile for Classificacao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Classificacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Classificacao"
          ]
        },
        {
          "displayNumber": 321,
          "id": "executive.tag",
          "what": "Commercial and customer-lifecycle profile for Tag, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Tag is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Tag"
          ]
        },
        {
          "displayNumber": 322,
          "id": "executive.indicador",
          "what": "Commercial and customer-lifecycle profile for Indicador, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Indicador is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Indicador"
          ]
        },
        {
          "displayNumber": 323,
          "id": "executive.metrica",
          "what": "Commercial and customer-lifecycle profile for Metrica, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Metrica is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Metrica"
          ]
        },
        {
          "displayNumber": 324,
          "id": "executive.dimensao",
          "what": "Commercial and customer-lifecycle profile for Dimensao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Dimensao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Dimensao"
          ]
        },
        {
          "displayNumber": 325,
          "id": "executive.filtro",
          "what": "Commercial and customer-lifecycle profile for Filtro, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Filtro is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Filtro"
          ]
        },
        {
          "displayNumber": 326,
          "id": "executive.visao",
          "what": "Commercial and customer-lifecycle profile for Visao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Visao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:renderer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Visao"
          ]
        },
        {
          "displayNumber": 327,
          "id": "executive.consulta",
          "what": "Commercial and customer-lifecycle profile for Consulta, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Consulta is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Consulta"
          ]
        },
        {
          "displayNumber": 328,
          "id": "executive.fonte-dados",
          "what": "Commercial and customer-lifecycle profile for Fonte Dados, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Fonte Dados is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: FonteDados"
          ]
        },
        {
          "displayNumber": 329,
          "id": "executive.dataset",
          "what": "Commercial and customer-lifecycle profile for Dataset, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Dataset is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Dataset"
          ]
        },
        {
          "displayNumber": 330,
          "id": "executive.tabela",
          "what": "Commercial and customer-lifecycle profile for Tabela, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Tabela is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Tabela"
          ]
        },
        {
          "displayNumber": 331,
          "id": "executive.campo",
          "what": "Commercial and customer-lifecycle profile for Campo, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Campo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Campo"
          ]
        },
        {
          "displayNumber": 332,
          "id": "executive.definicao",
          "what": "Commercial and customer-lifecycle profile for Definicao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Definicao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Definicao"
          ]
        },
        {
          "displayNumber": 333,
          "id": "executive.glossario",
          "what": "Commercial and customer-lifecycle profile for Glossario, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Glossario is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Glossario"
          ]
        },
        {
          "displayNumber": 334,
          "id": "executive.linhagem-dados",
          "what": "Commercial and customer-lifecycle profile for Linhagem Dados, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Linhagem Dados is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: LinhagemDados"
          ]
        },
        {
          "displayNumber": 335,
          "id": "executive.qualidade-dados",
          "what": "Commercial and customer-lifecycle profile for Qualidade Dados, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Qualidade Dados is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: QualidadeDados"
          ]
        },
        {
          "displayNumber": 336,
          "id": "executive.regra-negocio",
          "what": "Commercial and customer-lifecycle profile for Regra Negocio, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Regra Negocio is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RegraNegocio"
          ]
        },
        {
          "displayNumber": 337,
          "id": "executive.validacao",
          "what": "Commercial and customer-lifecycle profile for Validacao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Validacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Validacao"
          ]
        },
        {
          "displayNumber": 338,
          "id": "executive.integracao",
          "what": "Commercial and customer-lifecycle profile for Integracao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Integracao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Integracao"
          ]
        },
        {
          "displayNumber": 339,
          "id": "executive.sistema",
          "what": "Commercial and customer-lifecycle profile for Sistema, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Sistema is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Sistema"
          ]
        },
        {
          "displayNumber": 340,
          "id": "executive.aplicacao",
          "what": "Commercial and customer-lifecycle profile for Aplicacao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Aplicacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Aplicacao"
          ]
        },
        {
          "displayNumber": 341,
          "id": "executive.api",
          "what": "Commercial and customer-lifecycle profile for API, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "API is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: API"
          ]
        },
        {
          "displayNumber": 342,
          "id": "executive.endpoint",
          "what": "Commercial and customer-lifecycle profile for Endpoint, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Endpoint is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Endpoint"
          ]
        },
        {
          "displayNumber": 343,
          "id": "executive.webhook",
          "what": "Commercial and customer-lifecycle profile for Webhook, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Webhook is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Webhook"
          ]
        },
        {
          "displayNumber": 344,
          "id": "executive.job",
          "what": "Commercial and customer-lifecycle profile for Job, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Job is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Job"
          ]
        },
        {
          "displayNumber": 345,
          "id": "executive.pipeline-dados",
          "what": "Commercial and customer-lifecycle profile for Pipeline Dados, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Pipeline Dados is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PipelineDados"
          ]
        },
        {
          "displayNumber": 346,
          "id": "executive.automacao",
          "what": "Commercial and customer-lifecycle profile for Automacao, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Automacao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Automacao"
          ]
        },
        {
          "displayNumber": 347,
          "id": "executive.agente-ai",
          "what": "Commercial and customer-lifecycle profile for Agente AI, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Agente AI is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AgenteAI"
          ]
        },
        {
          "displayNumber": 348,
          "id": "executive.prompt",
          "what": "Commercial and customer-lifecycle profile for Prompt, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Prompt is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Prompt"
          ]
        },
        {
          "displayNumber": 349,
          "id": "executive.modelo-ai",
          "what": "Commercial and customer-lifecycle profile for Modelo AI, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Modelo AI is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ModeloAI"
          ]
        },
        {
          "displayNumber": 350,
          "id": "executive.avaliacao-ai",
          "what": "Commercial and customer-lifecycle profile for Avaliacao AI, including account context, channel, segment, stage, performance signals, and outcome evidence.",
          "why": "Avaliacao AI is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AvaliacaoAI"
          ]
        }
      ]
    },
    {
      "title": "People, Organization & Operating Model",
      "primaryCapabilityKinds": [
        "cap:profile",
        "cap:validator",
        "cap:transformer",
        "cap:renderer"
      ],
      "description": "Workforce, roles, organizational design, talent, performance, learning, and decision-rights entities.",
      "entries": [
        {
          "displayNumber": 351,
          "id": "executive.experimento-ai",
          "what": "Organization and workforce profile for Experimento AI, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Experimento AI is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ExperimentoAI"
          ]
        },
        {
          "displayNumber": 352,
          "id": "executive.caso-teste",
          "what": "Organization and workforce profile for Caso Teste, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Caso Teste is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CasoTeste"
          ]
        },
        {
          "displayNumber": 353,
          "id": "executive.teste",
          "what": "Organization and workforce profile for Teste, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Teste is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Teste"
          ]
        },
        {
          "displayNumber": 354,
          "id": "executive.resultado-teste",
          "what": "Organization and workforce profile for Resultado Teste, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Resultado Teste is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ResultadoTeste"
          ]
        },
        {
          "displayNumber": 355,
          "id": "executive.defeito",
          "what": "Organization and workforce profile for Defeito, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Defeito is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Defeito"
          ]
        },
        {
          "displayNumber": 356,
          "id": "executive.bug",
          "what": "Organization and workforce profile for Bug, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Bug is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Bug"
          ]
        },
        {
          "displayNumber": 357,
          "id": "executive.deploy",
          "what": "Organization and workforce profile for Deploy, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Deploy is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Deploy"
          ]
        },
        {
          "displayNumber": 358,
          "id": "executive.ambiente",
          "what": "Organization and workforce profile for Ambiente, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Ambiente is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Ambiente"
          ]
        },
        {
          "displayNumber": 359,
          "id": "executive.release-note",
          "what": "Organization and workforce profile for Release Note, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Release Note is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ReleaseNote"
          ]
        },
        {
          "displayNumber": 360,
          "id": "executive.rollback",
          "what": "Organization and workforce profile for Rollback, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Rollback is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Rollback"
          ]
        },
        {
          "displayNumber": 361,
          "id": "executive.monitoramento",
          "what": "Organization and workforce profile for Monitoramento, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Monitoramento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Monitoramento"
          ]
        },
        {
          "displayNumber": 362,
          "id": "executive.log",
          "what": "Organization and workforce profile for Log, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Log is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Log"
          ]
        },
        {
          "displayNumber": 363,
          "id": "executive.metrica-sistema",
          "what": "Organization and workforce profile for Metrica Sistema, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Metrica Sistema is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MetricaSistema"
          ]
        },
        {
          "displayNumber": 364,
          "id": "executive.visao-estrategica",
          "what": "Organization and workforce profile for Visao Estrategica, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Visao Estrategica is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:renderer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: VisaoEstrategica"
          ]
        },
        {
          "displayNumber": 365,
          "id": "executive.mapa-estrategico",
          "what": "Organization and workforce profile for Mapa Estrategico, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Mapa Estrategico is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MapaEstrategico"
          ]
        },
        {
          "displayNumber": 366,
          "id": "executive.tema-estrategico",
          "what": "Organization and workforce profile for Tema Estrategico, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tema Estrategico is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TemaEstrategico"
          ]
        },
        {
          "displayNumber": 367,
          "id": "executive.pilar-estrategico",
          "what": "Organization and workforce profile for Pilar Estrategico, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Pilar Estrategico is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PilarEstrategico"
          ]
        },
        {
          "displayNumber": 368,
          "id": "executive.alavanca-estrategica",
          "what": "Organization and workforce profile for Alavanca Estrategica, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Alavanca Estrategica is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AlavancaEstrategica"
          ]
        },
        {
          "displayNumber": 369,
          "id": "executive.aposta-estrategica",
          "what": "Organization and workforce profile for Aposta Estrategica, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Aposta Estrategica is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ApostaEstrategica"
          ]
        },
        {
          "displayNumber": 370,
          "id": "executive.opcao-estrategica",
          "what": "Organization and workforce profile for Opcao Estrategica, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Opcao Estrategica is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: OpcaoEstrategica"
          ]
        },
        {
          "displayNumber": 371,
          "id": "executive.tradeoff",
          "what": "Organization and workforce profile for Tradeoff, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tradeoff is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Tradeoff"
          ]
        },
        {
          "displayNumber": 372,
          "id": "executive.north-star-metric",
          "what": "Organization and workforce profile for North Star Metric, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "North Star Metric is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: NorthStarMetric"
          ]
        },
        {
          "displayNumber": 373,
          "id": "executive.tese-investimento",
          "what": "Organization and workforce profile for Tese Investimento, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tese Investimento is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseInvestimento"
          ]
        },
        {
          "displayNumber": 374,
          "id": "executive.tese-produto",
          "what": "Organization and workforce profile for Tese Produto, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tese Produto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseProduto"
          ]
        },
        {
          "displayNumber": 375,
          "id": "executive.tese-mercado",
          "what": "Organization and workforce profile for Tese Mercado, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tese Mercado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseMercado"
          ]
        },
        {
          "displayNumber": 376,
          "id": "executive.tese-cliente",
          "what": "Organization and workforce profile for Tese Cliente, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tese Cliente is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseCliente"
          ]
        },
        {
          "displayNumber": 377,
          "id": "executive.tese-operacional",
          "what": "Organization and workforce profile for Tese Operacional, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tese Operacional is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseOperacional"
          ]
        },
        {
          "displayNumber": 378,
          "id": "executive.tese-tecnologica",
          "what": "Organization and workforce profile for Tese Tecnologica, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tese Tecnologica is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseTecnologica"
          ]
        },
        {
          "displayNumber": 379,
          "id": "executive.tese-financeira",
          "what": "Organization and workforce profile for Tese Financeira, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tese Financeira is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseFinanceira"
          ]
        },
        {
          "displayNumber": 380,
          "id": "executive.tese-risco",
          "what": "Organization and workforce profile for Tese Risco, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tese Risco is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TeseRisco"
          ]
        },
        {
          "displayNumber": 381,
          "id": "executive.analise-swot",
          "what": "Organization and workforce profile for Analise SWOT, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Analise SWOT is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AnaliseSWOT"
          ]
        },
        {
          "displayNumber": 382,
          "id": "executive.forca",
          "what": "Organization and workforce profile for Forca, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Forca is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Forca"
          ]
        },
        {
          "displayNumber": 383,
          "id": "executive.fraqueza",
          "what": "Organization and workforce profile for Fraqueza, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Fraqueza is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Fraqueza"
          ]
        },
        {
          "displayNumber": 384,
          "id": "executive.oportunidade-externa",
          "what": "Organization and workforce profile for Oportunidade Externa, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Oportunidade Externa is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: OportunidadeExterna"
          ]
        },
        {
          "displayNumber": 385,
          "id": "executive.ameaca",
          "what": "Organization and workforce profile for Ameaca, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Ameaca is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Ameaca"
          ]
        },
        {
          "displayNumber": 386,
          "id": "executive.analise-pestel",
          "what": "Organization and workforce profile for Analise PESTEL, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Analise PESTEL is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AnalisePESTEL"
          ]
        },
        {
          "displayNumber": 387,
          "id": "executive.tendencia",
          "what": "Organization and workforce profile for Tendencia, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Tendencia is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Tendencia"
          ]
        },
        {
          "displayNumber": 388,
          "id": "executive.sinal-mercado",
          "what": "Organization and workforce profile for Sinal Mercado, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Sinal Mercado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SinalMercado"
          ]
        },
        {
          "displayNumber": 389,
          "id": "executive.insight",
          "what": "Organization and workforce profile for Insight, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Insight is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Insight"
          ]
        },
        {
          "displayNumber": 390,
          "id": "executive.assuncao-estrategica",
          "what": "Organization and workforce profile for Assuncao Estrategica, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Assuncao Estrategica is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AssuncaoEstrategica"
          ]
        },
        {
          "displayNumber": 391,
          "id": "executive.hipotese-mercado",
          "what": "Organization and workforce profile for Hipotese Mercado, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Hipotese Mercado is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HipoteseMercado"
          ]
        },
        {
          "displayNumber": 392,
          "id": "executive.hipotese-cliente",
          "what": "Organization and workforce profile for Hipotese Cliente, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Hipotese Cliente is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HipoteseCliente"
          ]
        },
        {
          "displayNumber": 393,
          "id": "executive.hipotese-produto",
          "what": "Organization and workforce profile for Hipotese Produto, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Hipotese Produto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HipoteseProduto"
          ]
        },
        {
          "displayNumber": 394,
          "id": "executive.hipotese-receita",
          "what": "Organization and workforce profile for Hipotese Receita, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Hipotese Receita is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HipoteseReceita"
          ]
        },
        {
          "displayNumber": 395,
          "id": "executive.hipotese-custo",
          "what": "Organization and workforce profile for Hipotese Custo, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Hipotese Custo is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HipoteseCusto"
          ]
        },
        {
          "displayNumber": 396,
          "id": "executive.hipotese-operacional",
          "what": "Organization and workforce profile for Hipotese Operacional, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Hipotese Operacional is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HipoteseOperacional"
          ]
        },
        {
          "displayNumber": 397,
          "id": "executive.hipotese-risco",
          "what": "Organization and workforce profile for Hipotese Risco, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Hipotese Risco is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: HipoteseRisco"
          ]
        },
        {
          "displayNumber": 398,
          "id": "executive.portfolio-produto",
          "what": "Organization and workforce profile for Portfolio Produto, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Portfolio Produto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PortfolioProduto"
          ]
        },
        {
          "displayNumber": 399,
          "id": "executive.linha-produto",
          "what": "Organization and workforce profile for Linha Produto, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Linha Produto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: LinhaProduto"
          ]
        },
        {
          "displayNumber": 400,
          "id": "executive.familia-produto",
          "what": "Organization and workforce profile for Familia Produto, including role context, accountability, capacity, lifecycle events, performance, and governance metadata.",
          "why": "Familia Produto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: FamiliaProduto"
          ]
        }
      ]
    },
    {
      "title": "Procurement, Supply Chain & Operations",
      "primaryCapabilityKinds": [
        "cap:profile",
        "cap:transformer",
        "cap:validator"
      ],
      "description": "Supplier management, sourcing, inventory, logistics, maintenance, production, and operational controls.",
      "entries": [
        {
          "displayNumber": 401,
          "id": "executive.modulo-produto",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Modulo Produto, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Modulo Produto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ModuloProduto"
          ]
        },
        {
          "displayNumber": 402,
          "id": "executive.componente-produto",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Componente Produto, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Componente Produto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ComponenteProduto"
          ]
        },
        {
          "displayNumber": 403,
          "id": "executive.configuracao-produto",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Configuracao Produto, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Configuracao Produto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ConfiguracaoProduto"
          ]
        },
        {
          "displayNumber": 404,
          "id": "executive.sku",
          "what": "Operational, procurement, supply-chain, or service-execution profile for SKU, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "SKU is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SKU"
          ]
        },
        {
          "displayNumber": 405,
          "id": "executive.preco",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Preco, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Preco is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Preco"
          ]
        },
        {
          "displayNumber": 406,
          "id": "executive.tabela-preco",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Tabela Preco, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Tabela Preco is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TabelaPreco"
          ]
        },
        {
          "displayNumber": 407,
          "id": "executive.regra-preco",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Regra Preco, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Regra Preco is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RegraPreco"
          ]
        },
        {
          "displayNumber": 408,
          "id": "executive.desconto",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Desconto, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Desconto is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Desconto"
          ]
        },
        {
          "displayNumber": 409,
          "id": "executive.promocao",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Promocao, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Promocao is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Promocao"
          ]
        },
        {
          "displayNumber": 410,
          "id": "executive.bundle",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Bundle, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Bundle is a high-utility enterprise concept that makes the registry more operationally complete and supports common management workflows.",
          "tier": "A",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Bundle"
          ]
        },
        {
          "displayNumber": 411,
          "id": "executive.pacote",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Pacote, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Pacote is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Pacote"
          ]
        },
        {
          "displayNumber": 412,
          "id": "executive.plano",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Plano, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Plano is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Plano"
          ]
        },
        {
          "displayNumber": 413,
          "id": "executive.assinatura-cliente",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Assinatura Cliente, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Assinatura Cliente is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AssinaturaCliente"
          ]
        },
        {
          "displayNumber": 414,
          "id": "executive.ciclo-vida-produto",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Ciclo Vida Produto, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Ciclo Vida Produto is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CicloVidaProduto"
          ]
        },
        {
          "displayNumber": 415,
          "id": "executive.estagio-produto",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Estagio Produto, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Estagio Produto is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: EstagioProduto"
          ]
        },
        {
          "displayNumber": 416,
          "id": "executive.obsolescencia",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Obsolescencia, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Obsolescencia is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Obsolescencia"
          ]
        },
        {
          "displayNumber": 417,
          "id": "executive.substituto",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Substituto, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Substituto is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Substituto"
          ]
        },
        {
          "displayNumber": 418,
          "id": "executive.complemento",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Complemento, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Complemento is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Complemento"
          ]
        },
        {
          "displayNumber": 419,
          "id": "executive.catalogo-produto",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Catalogo Produto, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Catalogo Produto is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CatalogoProduto"
          ]
        },
        {
          "displayNumber": 420,
          "id": "executive.canal-venda",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Canal Venda, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Canal Venda is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CanalVenda"
          ]
        },
        {
          "displayNumber": 421,
          "id": "executive.canal-distribuicao",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Canal Distribuicao, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Canal Distribuicao is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CanalDistribuicao"
          ]
        },
        {
          "displayNumber": 422,
          "id": "executive.canal-atendimento",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Canal Atendimento, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Canal Atendimento is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CanalAtendimento"
          ]
        },
        {
          "displayNumber": 423,
          "id": "executive.canal-marketing",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Canal Marketing, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Canal Marketing is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CanalMarketing"
          ]
        },
        {
          "displayNumber": 424,
          "id": "executive.ponto-contato",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Ponto Contato, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Ponto Contato is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PontoContato"
          ]
        },
        {
          "displayNumber": 425,
          "id": "executive.touchpoint",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Touchpoint, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Touchpoint is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Touchpoint"
          ]
        },
        {
          "displayNumber": 426,
          "id": "executive.jornada-parceiro",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Jornada Parceiro, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Jornada Parceiro is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: JornadaParceiro"
          ]
        },
        {
          "displayNumber": 427,
          "id": "executive.jornada-colaborador",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Jornada Colaborador, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Jornada Colaborador is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: JornadaColaborador"
          ]
        },
        {
          "displayNumber": 428,
          "id": "executive.jornada-fornecedor",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Jornada Fornecedor, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Jornada Fornecedor is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: JornadaFornecedor"
          ]
        },
        {
          "displayNumber": 429,
          "id": "executive.experiencia-usuario",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Experiencia Usuario, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Experiencia Usuario is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ExperienciaUsuario"
          ]
        },
        {
          "displayNumber": 430,
          "id": "executive.experiencia-parceiro",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Experiencia Parceiro, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Experiencia Parceiro is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ExperienciaParceiro"
          ]
        },
        {
          "displayNumber": 431,
          "id": "executive.experiencia-colaborador",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Experiencia Colaborador, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Experiencia Colaborador is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ExperienciaColaborador"
          ]
        },
        {
          "displayNumber": 432,
          "id": "executive.segmentacao",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Segmentacao, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Segmentacao is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Segmentacao"
          ]
        },
        {
          "displayNumber": 433,
          "id": "executive.microsegmento",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Microsegmento, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Microsegmento is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Microsegmento"
          ]
        },
        {
          "displayNumber": 434,
          "id": "executive.cluster-cliente",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Cluster Cliente, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Cluster Cliente is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ClusterCliente"
          ]
        },
        {
          "displayNumber": 435,
          "id": "executive.conta-chave",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Conta Chave, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Conta Chave is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContaChave"
          ]
        },
        {
          "displayNumber": 436,
          "id": "executive.account-plan",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Account Plan, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Account Plan is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AccountPlan"
          ]
        },
        {
          "displayNumber": 437,
          "id": "executive.plano-conta",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Plano Conta, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Plano Conta is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:transformer"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PlanoConta"
          ]
        },
        {
          "displayNumber": 438,
          "id": "executive.stakeholder-cliente",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Stakeholder Cliente, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Stakeholder Cliente is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: StakeholderCliente"
          ]
        },
        {
          "displayNumber": 439,
          "id": "executive.comprador",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Comprador, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Comprador is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Comprador"
          ]
        },
        {
          "displayNumber": 440,
          "id": "executive.influenciador",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Influenciador, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Influenciador is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Influenciador"
          ]
        },
        {
          "displayNumber": 441,
          "id": "executive.usuario-final",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Usuario Final, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Usuario Final is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: UsuarioFinal"
          ]
        },
        {
          "displayNumber": 442,
          "id": "executive.decisor-economico",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Decisor Economico, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Decisor Economico is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: DecisorEconomico"
          ]
        },
        {
          "displayNumber": 443,
          "id": "executive.campeao-interno",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Campeao Interno, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Campeao Interno is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CampeaoInterno"
          ]
        },
        {
          "displayNumber": 444,
          "id": "executive.detrator-interno",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Detrator Interno, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Detrator Interno is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: DetratorInterno"
          ]
        },
        {
          "displayNumber": 445,
          "id": "executive.mapa-poder",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Mapa Poder, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Mapa Poder is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MapaPoder"
          ]
        },
        {
          "displayNumber": 446,
          "id": "executive.nivel-relacionamento",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Nivel Relacionamento, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Nivel Relacionamento is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: NivelRelacionamento"
          ]
        },
        {
          "displayNumber": 447,
          "id": "executive.saude-conta",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Saude Conta, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Saude Conta is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SaudeConta"
          ]
        },
        {
          "displayNumber": 448,
          "id": "executive.risco-conta",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Risco Conta, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Risco Conta is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RiscoConta"
          ]
        },
        {
          "displayNumber": 449,
          "id": "executive.potencial-conta",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Potencial Conta, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Potencial Conta is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PotencialConta"
          ]
        },
        {
          "displayNumber": 450,
          "id": "executive.propensao-compra",
          "what": "Operational, procurement, supply-chain, or service-execution profile for Propensao Compra, including responsible party, process state, quantity/cost fields, dependencies, and evidence.",
          "why": "Propensao Compra is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PropensaoCompra"
          ]
        }
      ]
    },
    {
      "title": "Data, Technology, AI & Delivery",
      "primaryCapabilityKinds": [
        "cap:profile",
        "cap:asset",
        "cap:validator"
      ],
      "description": "Data products, AI agents, systems, APIs, software delivery, observability, infrastructure, and security operations.",
      "entries": [
        {
          "displayNumber": 451,
          "id": "executive.intencao-compra",
          "what": "Technology, data, AI, delivery, or security profile for Intencao Compra, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Intencao Compra is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: IntencaoCompra"
          ]
        },
        {
          "displayNumber": 452,
          "id": "executive.sinal-compra",
          "what": "Technology, data, AI, delivery, or security profile for Sinal Compra, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Sinal Compra is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SinalCompra"
          ]
        },
        {
          "displayNumber": 453,
          "id": "executive.sinal-churn",
          "what": "Technology, data, AI, delivery, or security profile for Sinal Churn, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Sinal Churn is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SinalChurn"
          ]
        },
        {
          "displayNumber": 454,
          "id": "executive.motivo-churn",
          "what": "Technology, data, AI, delivery, or security profile for Motivo Churn, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Motivo Churn is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MotivoChurn"
          ]
        },
        {
          "displayNumber": 455,
          "id": "executive.motivo-perda",
          "what": "Technology, data, AI, delivery, or security profile for Motivo Perda, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Motivo Perda is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MotivoPerda"
          ]
        },
        {
          "displayNumber": 456,
          "id": "executive.motivo-ganho",
          "what": "Technology, data, AI, delivery, or security profile for Motivo Ganho, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Motivo Ganho is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MotivoGanho"
          ]
        },
        {
          "displayNumber": 457,
          "id": "executive.concorrencia-oportunidade",
          "what": "Technology, data, AI, delivery, or security profile for Concorrencia Oportunidade, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Concorrencia Oportunidade is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ConcorrenciaOportunidade"
          ]
        },
        {
          "displayNumber": 458,
          "id": "executive.proposta-comercial",
          "what": "Technology, data, AI, delivery, or security profile for Proposta Comercial, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Proposta Comercial is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PropostaComercial"
          ]
        },
        {
          "displayNumber": 459,
          "id": "executive.versao-proposta",
          "what": "Technology, data, AI, delivery, or security profile for Versao Proposta, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Versao Proposta is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: VersaoProposta"
          ]
        },
        {
          "displayNumber": 460,
          "id": "executive.termo-comercial",
          "what": "Technology, data, AI, delivery, or security profile for Termo Comercial, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Termo Comercial is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TermoComercial"
          ]
        },
        {
          "displayNumber": 461,
          "id": "executive.condicao-comercial",
          "what": "Technology, data, AI, delivery, or security profile for Condicao Comercial, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Condicao Comercial is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CondicaoComercial"
          ]
        },
        {
          "displayNumber": 462,
          "id": "executive.condicao-pagamento",
          "what": "Technology, data, AI, delivery, or security profile for Condicao Pagamento, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Condicao Pagamento is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CondicaoPagamento"
          ]
        },
        {
          "displayNumber": 463,
          "id": "executive.condicao-entrega",
          "what": "Technology, data, AI, delivery, or security profile for Condicao Entrega, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Condicao Entrega is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CondicaoEntrega"
          ]
        },
        {
          "displayNumber": 464,
          "id": "executive.condicao-renovacao",
          "what": "Technology, data, AI, delivery, or security profile for Condicao Renovacao, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Condicao Renovacao is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CondicaoRenovacao"
          ]
        },
        {
          "displayNumber": 465,
          "id": "executive.clausula",
          "what": "Technology, data, AI, delivery, or security profile for Clausula, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Clausula is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Clausula"
          ]
        },
        {
          "displayNumber": 466,
          "id": "executive.obrigacao-contratual",
          "what": "Technology, data, AI, delivery, or security profile for Obrigacao Contratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Obrigacao Contratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ObrigacaoContratual"
          ]
        },
        {
          "displayNumber": 467,
          "id": "executive.direito-contratual",
          "what": "Technology, data, AI, delivery, or security profile for Direito Contratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Direito Contratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: DireitoContratual"
          ]
        },
        {
          "displayNumber": 468,
          "id": "executive.penalidade",
          "what": "Technology, data, AI, delivery, or security profile for Penalidade, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Penalidade is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Penalidade"
          ]
        },
        {
          "displayNumber": 469,
          "id": "executive.multa",
          "what": "Technology, data, AI, delivery, or security profile for Multa, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Multa is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Multa"
          ]
        },
        {
          "displayNumber": 470,
          "id": "executive.garantia-contratual",
          "what": "Technology, data, AI, delivery, or security profile for Garantia Contratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Garantia Contratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: GarantiaContratual"
          ]
        },
        {
          "displayNumber": 471,
          "id": "executive.vigencia-contrato",
          "what": "Technology, data, AI, delivery, or security profile for Vigencia Contrato, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Vigencia Contrato is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: VigenciaContrato"
          ]
        },
        {
          "displayNumber": 472,
          "id": "executive.aditivo-contrato",
          "what": "Technology, data, AI, delivery, or security profile for Aditivo Contrato, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Aditivo Contrato is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AditivoContrato"
          ]
        },
        {
          "displayNumber": 473,
          "id": "executive.distrato",
          "what": "Technology, data, AI, delivery, or security profile for Distrato, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Distrato is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Distrato"
          ]
        },
        {
          "displayNumber": 474,
          "id": "executive.rescisao",
          "what": "Technology, data, AI, delivery, or security profile for Rescisao, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Rescisao is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Rescisao"
          ]
        },
        {
          "displayNumber": 475,
          "id": "executive.renegociacao",
          "what": "Technology, data, AI, delivery, or security profile for Renegociacao, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Renegociacao is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Renegociacao"
          ]
        },
        {
          "displayNumber": 476,
          "id": "executive.pendencia-contratual",
          "what": "Technology, data, AI, delivery, or security profile for Pendencia Contratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Pendencia Contratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PendenciaContratual"
          ]
        },
        {
          "displayNumber": 477,
          "id": "executive.marco-contratual",
          "what": "Technology, data, AI, delivery, or security profile for Marco Contratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Marco Contratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: MarcoContratual"
          ]
        },
        {
          "displayNumber": 478,
          "id": "executive.entregavel-contratual",
          "what": "Technology, data, AI, delivery, or security profile for Entregavel Contratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Entregavel Contratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: EntregavelContratual"
          ]
        },
        {
          "displayNumber": 479,
          "id": "executive.evidencia-entrega",
          "what": "Technology, data, AI, delivery, or security profile for Evidencia Entrega, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Evidencia Entrega is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:asset"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: EvidenciaEntrega"
          ]
        },
        {
          "displayNumber": 480,
          "id": "executive.aceite-cliente",
          "what": "Technology, data, AI, delivery, or security profile for Aceite Cliente, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Aceite Cliente is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AceiteCliente"
          ]
        },
        {
          "displayNumber": 481,
          "id": "executive.aceite-fornecedor",
          "what": "Technology, data, AI, delivery, or security profile for Aceite Fornecedor, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Aceite Fornecedor is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AceiteFornecedor"
          ]
        },
        {
          "displayNumber": 482,
          "id": "executive.slacontratual",
          "what": "Technology, data, AI, delivery, or security profile for SLAContratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "SLAContratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: SLAContratual"
          ]
        },
        {
          "displayNumber": 483,
          "id": "executive.kpicontratual",
          "what": "Technology, data, AI, delivery, or security profile for KPIContratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "KPIContratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: KPIContratual"
          ]
        },
        {
          "displayNumber": 484,
          "id": "executive.risco-contratual",
          "what": "Technology, data, AI, delivery, or security profile for Risco Contratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Risco Contratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: RiscoContratual"
          ]
        },
        {
          "displayNumber": 485,
          "id": "executive.exposicao-contratual",
          "what": "Technology, data, AI, delivery, or security profile for Exposicao Contratual, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Exposicao Contratual is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ExposicaoContratual"
          ]
        },
        {
          "displayNumber": 486,
          "id": "executive.limite-credito",
          "what": "Technology, data, AI, delivery, or security profile for Limite Credito, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Limite Credito is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: LimiteCredito"
          ]
        },
        {
          "displayNumber": 487,
          "id": "executive.analise-credito",
          "what": "Technology, data, AI, delivery, or security profile for Analise Credito, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Analise Credito is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AnaliseCredito"
          ]
        },
        {
          "displayNumber": 488,
          "id": "executive.score-credito",
          "what": "Technology, data, AI, delivery, or security profile for Score Credito, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Score Credito is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ScoreCredito"
          ]
        },
        {
          "displayNumber": 489,
          "id": "executive.politica-credito",
          "what": "Technology, data, AI, delivery, or security profile for Politica Credito, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Politica Credito is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile",
            "cap:validator"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: PoliticaCredito"
          ]
        },
        {
          "displayNumber": 490,
          "id": "executive.aprovacao-credito",
          "what": "Technology, data, AI, delivery, or security profile for Aprovacao Credito, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Aprovacao Credito is a specialized but defensible enterprise concept; useful when the organization needs deeper operational or analytical precision.",
          "tier": "B",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: AprovacaoCredito"
          ]
        },
        {
          "displayNumber": 491,
          "id": "executive.garantia-financeira",
          "what": "Technology, data, AI, delivery, or security profile for Garantia Financeira, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Garantia Financeira is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: GarantiaFinanceira"
          ]
        },
        {
          "displayNumber": 492,
          "id": "executive.colateral",
          "what": "Technology, data, AI, delivery, or security profile for Colateral, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Colateral is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Colateral"
          ]
        },
        {
          "displayNumber": 493,
          "id": "executive.titulo-receber",
          "what": "Technology, data, AI, delivery, or security profile for Titulo Receber, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Titulo Receber is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TituloReceber"
          ]
        },
        {
          "displayNumber": 494,
          "id": "executive.titulo-pagar",
          "what": "Technology, data, AI, delivery, or security profile for Titulo Pagar, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Titulo Pagar is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: TituloPagar"
          ]
        },
        {
          "displayNumber": 495,
          "id": "executive.parcela",
          "what": "Technology, data, AI, delivery, or security profile for Parcela, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Parcela is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Parcela"
          ]
        },
        {
          "displayNumber": 496,
          "id": "executive.centro-resultado",
          "what": "Technology, data, AI, delivery, or security profile for Centro Resultado, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Centro Resultado is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: CentroResultado"
          ]
        },
        {
          "displayNumber": 497,
          "id": "executive.unidade-orcamentaria",
          "what": "Technology, data, AI, delivery, or security profile for Unidade Orcamentaria, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Unidade Orcamentaria is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: UnidadeOrcamentaria"
          ]
        },
        {
          "displayNumber": 498,
          "id": "executive.conta-contabil",
          "what": "Technology, data, AI, delivery, or security profile for Conta Contabil, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Conta Contabil is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: ContaContabil"
          ]
        },
        {
          "displayNumber": 499,
          "id": "executive.lancamento-contabil",
          "what": "Technology, data, AI, delivery, or security profile for Lancamento Contabil, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Lancamento Contabil is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: LancamentoContabil"
          ]
        },
        {
          "displayNumber": 500,
          "id": "executive.conciliacao",
          "what": "Technology, data, AI, delivery, or security profile for Conciliacao, including system context, interface contracts, lifecycle state, metrics, ownership, and operational evidence.",
          "why": "Conciliacao is included as a low-priority calibration entry to mark the boundary between broad enterprise primitives and more situational concepts.",
          "tier": "C",
          "capabilityKinds": [
            "cap:profile"
          ],
          "crossReferences": [],
          "notes": [
            "Source term: Conciliacao"
          ]
        }
      ]
    }
  ],
  "numberingReconciliation": {
    "note": "Display numbers are dense and exact: 1 through 500. Section counts are cross-checkable against section.entries.length.",
    "displayedNumberMin": 1,
    "displayedNumberMax": 500,
    "actualEntryCount": 500,
    "sectionCounts": [
      {
        "sectionTitle": "Core Enterprise Entities",
        "count": 70
      },
      {
        "sectionTitle": "Strategy, Portfolio & Product",
        "count": 70
      },
      {
        "sectionTitle": "Governance, Risk, Compliance & Legal",
        "count": 70
      },
      {
        "sectionTitle": "Finance, Revenue & Unit Economics",
        "count": 70
      },
      {
        "sectionTitle": "Customer, Sales, Marketing & Success",
        "count": 70
      },
      {
        "sectionTitle": "People, Organization & Operating Model",
        "count": 50
      },
      {
        "sectionTitle": "Procurement, Supply Chain & Operations",
        "count": 50
      },
      {
        "sectionTitle": "Data, Technology, AI & Delivery",
        "count": 50
      }
    ]
  },
  "deliberateOmissions": {
    "introduction": "The registry intentionally avoids pure synonyms and generic filler where possible, but a 500-entry expansion inevitably reaches more specialized concepts.",
    "omissions": [
      {
        "category": "Pure duplicates",
        "decision": "excluded",
        "rationale": "Repeated terms from the input vocabulary were deduplicated so plugin IDs remain unique and the schema passes duplicate-id validation.",
        "examples": [
          "Solicitacao repeated",
          "Assinatura repeated",
          "Correcao repeated"
        ]
      },
      {
        "category": "Non-enterprise consumer-only domains",
        "decision": "excluded",
        "rationale": "Domains with weak executive/business relevance were not added because the requested scope is executive/business schemas, not a universal ontology.",
        "examples": [
          "fitness-routine",
          "tabletop-campaign",
          "personal-diary"
        ]
      },
      {
        "category": "Ultra-specific vendor products",
        "decision": "deferred",
        "rationale": "Vendor-specific schemas should be modeled as adapters or templates over stable enterprise primitives rather than as core profile entries.",
        "examples": [
          "salesforce-opportunity",
          "sap-cost-center",
          "jira-issue"
        ]
      }
    ]
  },
  "maintainerRecommendation": {
    "body": "The useful next step is to convert this flat 500-entry registry into a relation-aware enterprise ontology: parent concepts, lifecycle states, ownership, metrics, evidence, and canonical cross-references.",
    "actions": [
      {
        "action": "Promote S and A entries into a canonical enterprise primitive catalog.",
        "rationale": "These concepts are broad enough to serve as reusable primitives across executive dashboards, operating reviews, strategy documents, finance models, and AI-agent workflows.",
        "targetTiers": [
          "S",
          "A"
        ],
        "targetCapabilities": [
          "cap:profile"
        ]
      },
      {
        "action": "Run a second pass to add crossReferences between related entries.",
        "rationale": "The current instance intentionally keeps crossReferences empty for first-pass validation. Relationship topology is the next layer of value.",
        "targetTiers": [
          "S",
          "A",
          "B"
        ],
        "targetCapabilities": [
          "cap:profile",
          "cap:validator"
        ]
      },
      {
        "action": "Split broad sections into function-specific packages only after validation.",
        "rationale": "The registry is easier to validate as one instance first, then package into finance, governance, customer, people, operations, data, and technology modules.",
        "targetTiers": [
          "S",
          "A",
          "B"
        ],
        "targetCapabilities": [
          "cap:profile"
        ]
      }
    ],
    "highestLeverageAction": {
      "title": "Enterprise primitive conformance test",
      "description": "Add a CI test that parses this registry with FdpmPluginIdeasRegistrySchema and verifies dense display numbers, unique executive.* ids, exact tier counts, section-count reconciliation, and non-empty capabilityKinds for every entry."
    }
  }
};

// Validate the instance against the schema at module load.
export const executiveDomainPluginIdeasRegistryParsed =
  FdpmPluginIdeasRegistrySchema.parse(executiveDomainPluginIdeasRegistry);
