"""Tests for price_quote.

Run with:
    uv run --with pytest pytest test_price_quote.py
"""

import math
from dataclasses import replace

import pytest

from price_quote import (
    CommercialAssumptions,
    CycleRoleAllocation,
    EngagementCycle,
    ProjectPricingInputs,
    RoleCost,
    calculate_cycle,
    calculate_project_price,
    load_pricing_inputs,
    price_from_margin,
)


# price_from_margin


class TestPriceFromMargin:
    def test_zero_margin_returns_cost(self):
        assert price_from_margin(100.0, 0.0) == 100.0

    def test_25pct_margin_invariant(self):
        # margin is over price, not cost: 100 / (1 - 0.25) = 133.33...
        price = price_from_margin(100.0, 0.25)
        assert math.isclose(price, 100 / 0.75)

        gross_margin = price - 100
        assert math.isclose(gross_margin / price, 0.25)

    def test_margin_vs_markup_distinction(self):
        # 25% margin -> 133.33; 25% markup -> 125; markup margin is 20%
        margin_price = price_from_margin(100.0, 0.25)
        markup_price = 100.0 * 1.25

        assert margin_price > markup_price
        assert math.isclose((markup_price - 100) / markup_price, 0.20)

    def test_rejects_negative_margin(self):
        with pytest.raises(ValueError, match="margin_pct"):
            price_from_margin(100.0, -0.01)

    def test_rejects_margin_exactly_one(self):
        with pytest.raises(ValueError, match="margin_pct"):
            price_from_margin(100.0, 1.0)

    def test_rejects_margin_above_one(self):
        with pytest.raises(ValueError, match="margin_pct"):
            price_from_margin(100.0, 1.5)


# CommercialAssumptions.validate


class TestCommercialAssumptionsValidate:
    def test_defaults_validate(self):
        CommercialAssumptions().validate()  # must not raise

    def test_negative_overhead_rejected(self):
        with pytest.raises(ValueError, match="vendor_overhead_pct"):
            CommercialAssumptions(vendor_overhead_pct=-0.01).validate()

    def test_negative_contingency_rejected(self):
        with pytest.raises(ValueError, match="risk_contingency_pct"):
            CommercialAssumptions(risk_contingency_pct=-0.01).validate()

    def test_negative_margin_rejected(self):
        with pytest.raises(ValueError, match="target_margin_pct"):
            CommercialAssumptions(target_margin_pct=-0.01).validate()

    def test_margin_equal_one_rejected(self):
        with pytest.raises(ValueError, match="target_margin_pct"):
            CommercialAssumptions(target_margin_pct=1.0).validate()

    def test_overhead_above_one_rejected(self):
        with pytest.raises(ValueError, match="vendor_overhead_pct"):
            CommercialAssumptions(vendor_overhead_pct=1.5).validate()

    def test_contingency_above_one_rejected(self):
        with pytest.raises(ValueError, match="risk_contingency_pct"):
            CommercialAssumptions(risk_contingency_pct=2.0).validate()


# calculate_cycle


class TestCalculateCycle:
    def test_single_role_single_month(self):
        cycle = EngagementCycle(
            name="Test",
            months=1,
            allocations=[CycleRoleAllocation("dev", 1.0)],
        )
        role_costs = {"dev": RoleCost("Dev", 10_000, loaded_cost_multiplier=1.0)}

        result = calculate_cycle(cycle, role_costs)

        assert result["fte_months"] == 1.0
        assert result["total_hours"] == 160.0
        assert result["delivery_cost_brl"] == 10_000.0
        assert math.isclose(result["average_cost_per_hour_brl"], 10_000.0 / 160.0)
        assert len(result["roles"]) == 1

    def test_multiple_roles_sum_correctly(self):
        cycle = EngagementCycle(
            name="Test",
            months=2,
            allocations=[
                CycleRoleAllocation("dev", 2.0),
                CycleRoleAllocation("qa", 1.0),
            ],
        )
        role_costs = {
            "dev": RoleCost("Dev", 10_000, loaded_cost_multiplier=1.0),
            "qa": RoleCost("QA", 5_000, loaded_cost_multiplier=1.0),
        }

        result = calculate_cycle(cycle, role_costs)

        # 2 FTE * 2 months + 1 FTE * 2 months = 6 FTE-months
        assert result["fte_months"] == 6.0
        # dev: 2 * 2 * 10_000 = 40_000; qa: 1 * 2 * 5_000 = 10_000
        assert result["delivery_cost_brl"] == 50_000.0

    def test_loaded_multiplier_applied(self):
        cycle = EngagementCycle(
            name="Test",
            months=1,
            allocations=[CycleRoleAllocation("dev", 1.0)],
        )
        role_costs = {"dev": RoleCost("Dev", 10_000, loaded_cost_multiplier=1.55)}

        result = calculate_cycle(cycle, role_costs)

        assert result["delivery_cost_brl"] == 15_500.0

    def test_missing_role_raises(self):
        cycle = EngagementCycle(
            name="Test",
            months=1,
            allocations=[CycleRoleAllocation("missing_role", 1.0)],
        )

        with pytest.raises(ValueError, match="missing_role"):
            calculate_cycle(cycle, {})


# calculate_project_price


class TestCalculateProjectPrice:
    def test_default_baseline_totals_consistent(self):
        result = calculate_project_price(load_pricing_inputs())
        summary = result["summary"]

        assert summary["currency"] == "BRL"
        assert summary["cycle_count"] == 3

        assert math.isclose(
            summary["direct_delivery_cost_brl"],
            sum(c["delivery_cost_brl"] for c in result["cycles"]),
        )
        assert math.isclose(
            summary["total_fte_months"],
            sum(c["fte_months"] for c in result["cycles"]),
        )
        assert math.isclose(
            summary["total_hours"],
            sum(c["total_hours"] for c in result["cycles"]),
        )

    def test_zero_margin_yields_break_even(self):
        inputs = replace(
            load_pricing_inputs(),
            commercial=CommercialAssumptions(
                vendor_overhead_pct=0.0,
                risk_contingency_pct=0.0,
                target_margin_pct=0.0,
            ),
        )

        result = calculate_project_price(inputs)
        summary = result["summary"]

        assert math.isclose(
            summary["client_price_brl"],
            summary["direct_delivery_cost_brl"],
        )
        assert summary["gross_margin_brl"] == 0.0
        assert summary["effective_margin_pct"] == 0.0

    def test_margin_application_yields_target(self):
        inputs = replace(
            load_pricing_inputs(),
            commercial=CommercialAssumptions(
                vendor_overhead_pct=0.0,
                risk_contingency_pct=0.0,
                target_margin_pct=0.25,
            ),
        )

        result = calculate_project_price(inputs)
        summary = result["summary"]

        # With zero overhead/contingency, price = direct / 0.75
        expected_price = summary["direct_delivery_cost_brl"] / 0.75
        assert math.isclose(summary["client_price_brl"], expected_price)
        assert math.isclose(summary["effective_margin_pct"], 0.25)

    def test_overhead_and_contingency_apply_to_direct_cost(self):
        inputs = replace(
            load_pricing_inputs(),
            commercial=CommercialAssumptions(
                vendor_overhead_pct=0.10,
                risk_contingency_pct=0.05,
                target_margin_pct=0.0,
            ),
        )

        result = calculate_project_price(inputs)
        summary = result["summary"]
        direct = summary["direct_delivery_cost_brl"]

        assert math.isclose(summary["vendor_overhead_brl"], direct * 0.10)
        assert math.isclose(summary["risk_contingency_brl"], direct * 0.05)
        assert math.isclose(
            summary["total_cost_before_margin_brl"],
            direct * (1 + 0.10 + 0.05),
        )

    def test_combined_overhead_contingency_margin(self):
        inputs = replace(
            load_pricing_inputs(),
            commercial=CommercialAssumptions(
                vendor_overhead_pct=0.12,
                risk_contingency_pct=0.08,
                target_margin_pct=0.25,
            ),
        )

        result = calculate_project_price(inputs)
        summary = result["summary"]
        direct = summary["direct_delivery_cost_brl"]

        expected_before_margin = direct * 1.20
        expected_price = expected_before_margin / 0.75

        assert math.isclose(
            summary["total_cost_before_margin_brl"], expected_before_margin
        )
        assert math.isclose(summary["client_price_brl"], expected_price)
        assert math.isclose(summary["effective_margin_pct"], 0.25)

    def test_invalid_commercial_rejected_before_compute(self):
        inputs = ProjectPricingInputs(
            commercial=CommercialAssumptions(target_margin_pct=1.0),
        )

        with pytest.raises(ValueError, match="target_margin_pct"):
            calculate_project_price(inputs)

    def test_result_includes_serialised_inputs(self):
        result = calculate_project_price(load_pricing_inputs())

        assert "inputs" in result
        assert result["inputs"]["currency"] == "BRL"
        assert result["inputs"]["city"] == "São Paulo"


# load_pricing_inputs


class TestLoadPricingInputs:
    def test_loads_bundled_config(self):
        inputs = load_pricing_inputs()

        assert inputs.project_name == "iOS + Android to Flutter Rebuild"
        assert inputs.city == "São Paulo"
        assert inputs.currency == "BRL"
        assert len(inputs.cycles) == 3
        assert "flutter_developer" in inputs.role_costs

    def test_applies_loaded_multiplier_from_constants(self, tmp_path):
        cfg = tmp_path / "cfg.toml"
        cfg.write_text(
            '[project]\nname="x"\ncity="x"\ncurrency="BRL"\n'
            "[constants]\nloaded_cost_multiplier = 2.0\nhours_per_fte_month = 100\n"
            "[role_costs.dev]\nrole_name='Dev'\nmonthly_base_cost_brl = 10000\n"
            '[[cycles]]\nname="C"\nmonths = 1\n'
            'allocations = [{ role = "dev", fte = 1.0 }]\n',
            encoding="utf-8",
        )

        inputs = load_pricing_inputs(cfg)

        assert inputs.role_costs["dev"].loaded_cost_multiplier == 2.0
        assert inputs.cycles[0].hours_per_fte_month == 100

    def test_role_level_multiplier_overrides_constant(self, tmp_path):
        cfg = tmp_path / "cfg.toml"
        cfg.write_text(
            "[constants]\nloaded_cost_multiplier = 1.5\n"
            "[role_costs.dev]\nrole_name='Dev'\nmonthly_base_cost_brl = 10000\n"
            "loaded_cost_multiplier = 1.2\n"
            "[role_costs.qa]\nrole_name='QA'\nmonthly_base_cost_brl = 5000\n",
            encoding="utf-8",
        )

        inputs = load_pricing_inputs(cfg)

        assert inputs.role_costs["dev"].loaded_cost_multiplier == 1.2
        assert inputs.role_costs["qa"].loaded_cost_multiplier == 1.5

    def test_missing_file_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_pricing_inputs(tmp_path / "does_not_exist.toml")

    def test_bundled_config_round_trips_through_pricing(self):
        # End-to-end: TOML -> inputs -> result; no exceptions, sane shape.
        result = calculate_project_price(load_pricing_inputs())

        assert result["summary"]["cycle_count"] == 3
        assert result["summary"]["direct_delivery_cost_brl"] > 0
        assert result["summary"]["client_price_brl"] > result["summary"][
            "direct_delivery_cost_brl"
        ]
