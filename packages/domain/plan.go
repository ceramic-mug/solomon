package domain

import (
	"time"

	"github.com/google/uuid"
)

// Plan is a complete financial universe — a self-contained model of income,
// expenses, debt, investments, and life events projected over time.
//
// Plans can be forked: a forked plan inherits the parent's data up to
// ForkMonth, then diverges. This creates a tree of "what-if" scenarios.
type Plan struct {
	ID           uuid.UUID  `json:"id"`
	ProfileID    uuid.UUID  `json:"profile_id"`
	ParentPlanID *uuid.UUID `json:"parent_plan_id,omitempty"` // nil = root plan
	ForkMonth    *int       `json:"fork_month,omitempty"`     // 0-indexed month where this branch diverges
	Name         string     `json:"name"`
	Description  string     `json:"description"`
	CreatedByAI  bool       `json:"created_by_ai"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	// Composition — populated on full plan fetch
	SimulationConfig   SimulationConfig    `json:"simulation_config"`
	IncomeStreams       []IncomeStream      `json:"income_streams"`
	Expenses           []Expense           `json:"expenses"`
	DebtAccounts       []DebtAccount       `json:"debt_accounts"`
	InvestmentAccounts []InvestmentAccount `json:"investment_accounts"`
	LifeEvents         []LifeEvent         `json:"life_events"`
	GivingTargets      []GivingTarget      `json:"giving_targets"`
}

// SimulationConfig controls how the simulation engine runs for a given plan.
type SimulationConfig struct {
	ID               uuid.UUID `json:"id"`
	PlanID           uuid.UUID `json:"plan_id"`
	StartYear        int       `json:"start_year"`  // e.g. 2026
	StartMonth       int       `json:"start_month"` // 1-12
	HorizonYears     int       `json:"horizon_years"`
	InflationRate    float64   `json:"inflation_rate"`    // e.g. 0.03
	MonteCarloPasses int       `json:"monte_carlo_passes"` // e.g. 1000

	// Asset class assumptions for investment compounding and Monte Carlo
	StockMeanReturn float64 `json:"stock_mean_return"` // e.g. 0.07
	StockStdDev     float64 `json:"stock_std_dev"`     // e.g. 0.15
	BondMeanReturn  float64 `json:"bond_mean_return"`  // e.g. 0.04
	BondStdDev      float64 `json:"bond_std_dev"`      // e.g. 0.06

	// Cash flow constraint (optimizer)
	TargetCashFlow      float64 `json:"target_cash_flow"`     // e.g. 1000 — minimum monthly cash flow to maintain
	ConstrainGiving     bool    `json:"constrain_giving"`     // if true, giving targets are scaled down to meet target_cash_flow
	ConstrainSavings    bool    `json:"constrain_savings"`    // if true, savings/cash accounts are scaled down
	ConstrainInvestments bool   `json:"constrain_investments"` // if true, retirement/brokerage accounts are scaled down
}

// DefaultSimulationConfig returns sensible defaults for a new plan.
func DefaultSimulationConfig(planID uuid.UUID) SimulationConfig {
	return SimulationConfig{
		ID:               uuid.New(),
		PlanID:           planID,
		StartYear:        2026,
		StartMonth:       7,
		HorizonYears:     30,
		InflationRate:    0.03,
		MonteCarloPasses: 1000,
		StockMeanReturn:  0.07,
		StockStdDev:      0.15,
		BondMeanReturn:   0.04,
		BondStdDev:       0.06,
	}
}
