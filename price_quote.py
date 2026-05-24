"""BRL-native São Paulo pricing model.

Model:
  1. Estimate direct delivery cost from role monthly costs
  2. Add vendor overhead
  3. Add risk contingency
  4. Apply target gross margin

Gross margin formula:

  client_price = total_cost / (1 - target_margin_pct)

Because margin is calculated over final price, not over cost.

Example:

  cost = 100, margin = 25%  ->  price = 133.33, gross_margin = 33.33
  margin_pct = 33.33 / 133.33 = 25%

This differs from markup:

  price = 100 * 1.25 = 125
  margin_pct = 25 / 125 = 20%

Default baseline:

  São Paulo, BRL, Flutter rebuild from existing iOS + Android app,
  9-month engagement cycle, 160 hours per FTE-month.
"""

import tomllib
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any, Dict, List, TypedDict


DEFAULT_CONFIG_PATH = Path(__file__).parent / "price_quote.toml"

# Algebraic-identity fallbacks. Real scenario values live in the TOML;
# these only apply if a caller constructs the dataclasses directly without
# going through load_pricing_inputs.
DEFAULT_LOADED_COST_MULTIPLIER = 1.0
DEFAULT_HOURS_PER_FTE_MONTH = 160


@dataclass
class RoleCost:
    role_name: str
    monthly_base_cost_brl: float
    loaded_cost_multiplier: float = DEFAULT_LOADED_COST_MULTIPLIER

    @property
    def monthly_loaded_cost_brl(self) -> float:
        return self.monthly_base_cost_brl * self.loaded_cost_multiplier


@dataclass
class CycleRoleAllocation:
    role_name: str
    fte_count: float


@dataclass
class EngagementCycle:
    name: str
    months: float
    allocations: List[CycleRoleAllocation]
    hours_per_fte_month: int = DEFAULT_HOURS_PER_FTE_MONTH


@dataclass
class CommercialAssumptions:
    vendor_overhead_pct: float = 0.0
    risk_contingency_pct: float = 0.0
    target_margin_pct: float = 0.0

    def validate(self) -> None:
        for f in fields(self):
            value = getattr(self, f.name)
            if value < 0:
                raise ValueError(f"{f.name} cannot be negative (got {value}).")
            if value > 1:
                raise ValueError(
                    f"{f.name} cannot exceed 1.0 / 100% (got {value})."
                )

        if self.target_margin_pct >= 1:
            raise ValueError(
                "target_margin_pct must be strictly less than 1.0 "
                f"(got {self.target_margin_pct}); the formula divides by "
                "(1 - target_margin_pct)."
            )


@dataclass
class ProjectPricingInputs:
    project_name: str = "iOS + Android to Flutter Rebuild"
    city: str = "São Paulo"
    currency: str = "BRL"

    role_costs: Dict[str, RoleCost] = field(default_factory=dict)
    cycles: List[EngagementCycle] = field(default_factory=list)
    commercial: CommercialAssumptions = field(default_factory=CommercialAssumptions)


# Result shapes


class RoleLine(TypedDict):
    role_key: str
    role_name: str
    fte_count: float
    months: float
    hours_per_fte_month: int
    fte_months: float
    total_hours: float
    monthly_base_cost_brl: float
    loaded_cost_multiplier: float
    monthly_loaded_cost_brl: float
    cost_brl: float
    cost_per_hour_brl: float


class CycleResult(TypedDict):
    name: str
    months: float
    hours_per_fte_month: int
    fte_months: float
    total_hours: float
    delivery_cost_brl: float
    average_cost_per_hour_brl: float
    roles: List[RoleLine]


class PricingSummary(TypedDict):
    project_name: str
    city: str
    currency: str
    cycle_count: int
    total_fte_months: float
    total_hours: float
    direct_delivery_cost_brl: float
    vendor_overhead_pct: float
    vendor_overhead_brl: float
    risk_contingency_pct: float
    risk_contingency_brl: float
    total_cost_before_margin_brl: float
    target_margin_pct: float
    client_price_brl: float
    gross_margin_brl: float
    effective_margin_pct: float
    average_monthly_loaded_cost_per_fte_brl: float
    average_client_price_per_fte_month_brl: float
    average_direct_cost_per_hour_brl: float
    average_cost_before_margin_per_hour_brl: float
    average_client_price_per_hour_brl: float


class PricingResult(TypedDict):
    inputs: Dict[str, Any]
    summary: PricingSummary
    cycles: List[CycleResult]


def load_pricing_inputs(
    path: Path = DEFAULT_CONFIG_PATH,
) -> ProjectPricingInputs:
    """Load pricing inputs from a TOML config file.

    Schema:
      [project]         name, city, currency
      [constants]       loaded_cost_multiplier, hours_per_fte_month
      [commercial]      vendor_overhead_pct, risk_contingency_pct, target_margin_pct
      [role_costs.<k>]  role_name, monthly_base_cost_brl, [loaded_cost_multiplier]
      [[cycles]]        name, months, allocations=[{role, fte}], [hours_per_fte_month]
    """
    with path.open("rb") as f:
        data = tomllib.load(f)

    constants = data.get("constants", {})
    default_multiplier = constants.get(
        "loaded_cost_multiplier", DEFAULT_LOADED_COST_MULTIPLIER
    )
    default_hours = constants.get(
        "hours_per_fte_month", DEFAULT_HOURS_PER_FTE_MONTH
    )

    role_costs = {
        key: RoleCost(
            role_name=role["role_name"],
            monthly_base_cost_brl=float(role["monthly_base_cost_brl"]),
            loaded_cost_multiplier=float(
                role.get("loaded_cost_multiplier", default_multiplier)
            ),
        )
        for key, role in data.get("role_costs", {}).items()
    }

    cycles = [
        EngagementCycle(
            name=cycle["name"],
            months=float(cycle["months"]),
            allocations=[
                CycleRoleAllocation(
                    role_name=a["role"],
                    fte_count=float(a["fte"]),
                )
                for a in cycle.get("allocations", [])
            ],
            hours_per_fte_month=int(
                cycle.get("hours_per_fte_month", default_hours)
            ),
        )
        for cycle in data.get("cycles", [])
    ]

    project = data.get("project", {})
    commercial_raw = data.get("commercial", {})
    commercial = CommercialAssumptions(
        vendor_overhead_pct=float(commercial_raw.get("vendor_overhead_pct", 0.0)),
        risk_contingency_pct=float(commercial_raw.get("risk_contingency_pct", 0.0)),
        target_margin_pct=float(commercial_raw.get("target_margin_pct", 0.0)),
    )

    return ProjectPricingInputs(
        project_name=project.get("name", "Unnamed Project"),
        city=project.get("city", ""),
        currency=project.get("currency", "BRL"),
        role_costs=role_costs,
        cycles=cycles,
        commercial=commercial,
    )


def price_from_margin(cost: float, margin_pct: float) -> float:
    if not 0 <= margin_pct < 1:
        raise ValueError(
            f"margin_pct must be in [0, 1) (got {margin_pct})."
        )

    return cost / (1 - margin_pct)


def calculate_cycle(
    cycle: EngagementCycle,
    role_costs: Dict[str, RoleCost],
) -> CycleResult:
    role_lines: List[RoleLine] = []
    cycle_delivery_cost_brl = 0.0
    cycle_fte_months = 0.0
    cycle_total_hours = 0.0

    for allocation in cycle.allocations:
        if allocation.role_name not in role_costs:
            raise ValueError(f"Missing role cost for: {allocation.role_name}")

        role_cost = role_costs[allocation.role_name]

        fte_months = allocation.fte_count * cycle.months
        total_hours = fte_months * cycle.hours_per_fte_month
        cost_brl = fte_months * role_cost.monthly_loaded_cost_brl
        cost_per_hour_brl = cost_brl / total_hours if total_hours else 0

        cycle_fte_months += fte_months
        cycle_total_hours += total_hours
        cycle_delivery_cost_brl += cost_brl

        role_lines.append(
            RoleLine(
                role_key=allocation.role_name,
                role_name=role_cost.role_name,
                fte_count=allocation.fte_count,
                months=cycle.months,
                hours_per_fte_month=cycle.hours_per_fte_month,
                fte_months=fte_months,
                total_hours=total_hours,
                monthly_base_cost_brl=role_cost.monthly_base_cost_brl,
                loaded_cost_multiplier=role_cost.loaded_cost_multiplier,
                monthly_loaded_cost_brl=role_cost.monthly_loaded_cost_brl,
                cost_brl=cost_brl,
                cost_per_hour_brl=cost_per_hour_brl,
            )
        )

    average_cost_per_hour_brl = (
        cycle_delivery_cost_brl / cycle_total_hours
        if cycle_total_hours else 0
    )

    return CycleResult(
        name=cycle.name,
        months=cycle.months,
        hours_per_fte_month=cycle.hours_per_fte_month,
        fte_months=cycle_fte_months,
        total_hours=cycle_total_hours,
        delivery_cost_brl=cycle_delivery_cost_brl,
        average_cost_per_hour_brl=average_cost_per_hour_brl,
        roles=role_lines,
    )


def calculate_project_price(inputs: ProjectPricingInputs) -> PricingResult:
    inputs.commercial.validate()

    cycles = [
        calculate_cycle(cycle, inputs.role_costs)
        for cycle in inputs.cycles
    ]

    total_fte_months = sum(cycle["fte_months"] for cycle in cycles)
    total_hours = sum(cycle["total_hours"] for cycle in cycles)

    direct_delivery_cost_brl = sum(
        cycle["delivery_cost_brl"] for cycle in cycles
    )

    vendor_overhead_brl = (
        direct_delivery_cost_brl * inputs.commercial.vendor_overhead_pct
    )

    risk_contingency_brl = (
        direct_delivery_cost_brl * inputs.commercial.risk_contingency_pct
    )

    total_cost_before_margin_brl = (
        direct_delivery_cost_brl
        + vendor_overhead_brl
        + risk_contingency_brl
    )

    client_price_brl = price_from_margin(
        total_cost_before_margin_brl,
        inputs.commercial.target_margin_pct,
    )

    gross_margin_brl = client_price_brl - total_cost_before_margin_brl

    average_monthly_loaded_cost_per_fte_brl = (
        direct_delivery_cost_brl / total_fte_months
        if total_fte_months else 0
    )

    average_client_price_per_fte_month_brl = (
        client_price_brl / total_fte_months
        if total_fte_months else 0
    )

    average_direct_cost_per_hour_brl = (
        direct_delivery_cost_brl / total_hours if total_hours else 0
    )

    average_cost_before_margin_per_hour_brl = (
        total_cost_before_margin_brl / total_hours if total_hours else 0
    )

    average_client_price_per_hour_brl = (
        client_price_brl / total_hours if total_hours else 0
    )

    summary = PricingSummary(
        project_name=inputs.project_name,
        city=inputs.city,
        currency=inputs.currency,
        cycle_count=len(inputs.cycles),
        total_fte_months=total_fte_months,
        total_hours=total_hours,
        direct_delivery_cost_brl=direct_delivery_cost_brl,
        vendor_overhead_pct=inputs.commercial.vendor_overhead_pct,
        vendor_overhead_brl=vendor_overhead_brl,
        risk_contingency_pct=inputs.commercial.risk_contingency_pct,
        risk_contingency_brl=risk_contingency_brl,
        total_cost_before_margin_brl=total_cost_before_margin_brl,
        target_margin_pct=inputs.commercial.target_margin_pct,
        client_price_brl=client_price_brl,
        gross_margin_brl=gross_margin_brl,
        effective_margin_pct=(
            gross_margin_brl / client_price_brl if client_price_brl else 0
        ),
        average_monthly_loaded_cost_per_fte_brl=average_monthly_loaded_cost_per_fte_brl,
        average_client_price_per_fte_month_brl=average_client_price_per_fte_month_brl,
        average_direct_cost_per_hour_brl=average_direct_cost_per_hour_brl,
        average_cost_before_margin_per_hour_brl=average_cost_before_margin_per_hour_brl,
        average_client_price_per_hour_brl=average_client_price_per_hour_brl,
    )

    return PricingResult(
        inputs=asdict(inputs),
        summary=summary,
        cycles=cycles,
    )


def _br_number(value: float) -> str:
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def brl(value: float) -> str:
    return f"R$ {_br_number(value)}"


def number(value: float) -> str:
    return _br_number(value)


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def print_pricing_report(result: PricingResult) -> None:
    summary = result["summary"]

    print("PROJECT PRICING ESTIMATE")
    print("=" * 120)

    print(f"Project:                         {summary['project_name']}")
    print(f"Location basis:                  {summary['city']}")
    print(f"Currency:                        {summary['currency']}")
    print(f"Cycles:                          {summary['cycle_count']}")
    print(f"Total FTE-months:                {number(summary['total_fte_months'])}")
    print(f"Total hours:                     {summary['total_hours']:,.0f}")

    print("\nCOMMERCIAL SUMMARY")
    print("-" * 120)
    print(f"Direct delivery cost:            {brl(summary['direct_delivery_cost_brl'])}")
    print(
        f"Vendor overhead:                 "
        f"{pct(summary['vendor_overhead_pct'])} = {brl(summary['vendor_overhead_brl'])}"
    )
    print(
        f"Risk contingency:                "
        f"{pct(summary['risk_contingency_pct'])} = {brl(summary['risk_contingency_brl'])}"
    )
    print(f"Cost before margin:              {brl(summary['total_cost_before_margin_brl'])}")
    print(f"Target gross margin:             {pct(summary['target_margin_pct'])}")
    print(f"Client price:                    {brl(summary['client_price_brl'])}")
    print(f"Gross margin:                    {brl(summary['gross_margin_brl'])}")
    print(f"Effective margin:                {pct(summary['effective_margin_pct'])}")

    print("\nUNIT ECONOMICS")
    print("-" * 120)
    print(
        f"Avg loaded cost / FTE-month:     "
        f"{brl(summary['average_monthly_loaded_cost_per_fte_brl'])}"
    )
    print(
        f"Avg client price / FTE-month:    "
        f"{brl(summary['average_client_price_per_fte_month_brl'])}"
    )
    print(
        f"Avg direct cost / hour:          "
        f"{brl(summary['average_direct_cost_per_hour_brl'])}"
    )
    print(
        f"Avg cost before margin / hour:   "
        f"{brl(summary['average_cost_before_margin_per_hour_brl'])}"
    )
    print(
        f"Avg client price / hour:         "
        f"{brl(summary['average_client_price_per_hour_brl'])}"
    )

    print("\nCYCLE BREAKDOWN")
    print("-" * 120)
    print(
        f"{'Cycle':32} "
        f"{'Months':>8} "
        f"{'FTE-months':>14} "
        f"{'Hours':>12} "
        f"{'Cost / Hour':>18} "
        f"{'Delivery Cost':>22}"
    )
    print("-" * 120)

    for cycle in result["cycles"]:
        print(
            f"{cycle['name'][:32]:32} "
            f"{cycle['months']:>8,.2f} "
            f"{cycle['fte_months']:>14,.2f} "
            f"{cycle['total_hours']:>12,.0f} "
            f"{brl(cycle['average_cost_per_hour_brl']):>18} "
            f"{brl(cycle['delivery_cost_brl']):>22}"
        )

    print("\nROLE BREAKDOWN BY CYCLE")
    print("-" * 120)

    for cycle in result["cycles"]:
        print(f"\n{cycle['name']}")
        print(
            f"{'Role':34} "
            f"{'FTE':>8} "
            f"{'Months':>8} "
            f"{'FTE-months':>12} "
            f"{'Hours':>12} "
            f"{'Cost / Hour':>16} "
            f"{'Cost':>18}"
        )
        print("-" * 120)

        for role in cycle["roles"]:
            print(
                f"{role['role_name'][:34]:34} "
                f"{role['fte_count']:>8,.2f} "
                f"{role['months']:>8,.2f} "
                f"{role['fte_months']:>12,.2f} "
                f"{role['total_hours']:>12,.0f} "
                f"{brl(role['cost_per_hour_brl']):>16} "
                f"{brl(role['cost_brl']):>18}"
            )


if __name__ == "__main__":
    result = calculate_project_price(load_pricing_inputs())
    print_pricing_report(result)
