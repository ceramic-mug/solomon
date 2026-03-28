package domain

import "github.com/google/uuid"

// MonthSnapshot is the complete financial state at the end of a single simulated month.
type MonthSnapshot struct {
	Month              int     `json:"month"`               // 0-indexed from plan start
	Year               int     `json:"year"`                // calendar year
	CalendarMonth      int     `json:"calendar_month"`      // 1-12
	GrossIncome        float64 `json:"gross_income"`        // total gross income this month
	TaxesPaid          float64 `json:"taxes_paid"`          // federal + state + FICA
	NetIncome          float64 `json:"net_income"`          // gross - taxes
	TotalExpenses      float64 `json:"total_expenses"`      // sum of all expense categories
	TotalDebtPayments  float64 `json:"total_debt_payments"` // principal + interest paid
	TotalInterestPaid  float64 `json:"total_interest_paid"` // interest portion only
	TotalGiving        float64 `json:"total_giving"`        // charitable giving this month
	TotalInvestContrib float64 `json:"total_invest_contrib"` // contributions this month
	CashFlow           float64 `json:"cash_flow"`           // net_income - expenses - debt - giving - investing
	TotalDebt          float64 `json:"total_debt"`          // remaining debt balance
	TotalInvestments   float64 `json:"total_investments"`   // total investment account value
	NetWorth           float64 `json:"net_worth"`           // investments - debt (+ any other assets)

	// Per-account breakdowns (optional detail)
	DebtBalances       map[string]float64 `json:"debt_balances,omitempty"`
	InvestmentBalances map[string]float64 `json:"investment_balances,omitempty"`

	// PSLF tracking
	PSLFQualifyingPayments int `json:"pslf_qualifying_payments,omitempty"` // cumulative PSLF payments

	// Home equity (non-zero when plan has a mortgage with PropertyValue set)
	HomeEquity float64 `json:"home_equity,omitempty"`
}

// SimulationResult is the output of a full simulation run for a plan.
type SimulationResult struct {
	ID              uuid.UUID       `json:"id"`
	PlanID          uuid.UUID       `json:"plan_id"`
	MonthlySnapshot []MonthSnapshot `json:"monthly_snapshots"`

	// Monte Carlo percentile bands (nil if MC was not run)
	MonteCarlo *MonteCarloResult `json:"monte_carlo,omitempty"`

	// Goal progress for accounts with GoalTarget set
	GoalProgress []GoalProgress `json:"goal_progress,omitempty"`
}

// MonteCarloResult holds the percentile distribution from a Monte Carlo simulation run.
// Each slice has one entry per simulation month (len = horizon_years * 12).
type MonteCarloResult struct {
	Passes int       `json:"passes"`
	P10    []float64 `json:"p10"` // 10th percentile net worth per month
	P25    []float64 `json:"p25"`
	P50    []float64 `json:"p50"` // median
	P75    []float64 `json:"p75"`
	P90    []float64 `json:"p90"`
}

// PlanComparison summarizes the delta between two simulation results at key horizons.
type PlanComparison struct {
	PlanAID uuid.UUID          `json:"plan_a_id"`
	PlanBID uuid.UUID          `json:"plan_b_id"`
	Deltas  []HorizonDelta     `json:"deltas"`
}

// HorizonDelta shows the net worth difference between two plans at a specific year.
type HorizonDelta struct {
	Year          int     `json:"year"`
	PlanANetWorth float64 `json:"plan_a_net_worth"`
	PlanBNetWorth float64 `json:"plan_b_net_worth"`
	Delta         float64 `json:"delta"` // plan_b - plan_a
}

// HorizonDeltaFull extends HorizonDelta with per-plan debt and investment values.
type HorizonDeltaFull struct {
	Year             int     `json:"year"`
	PlanANetWorth    float64 `json:"plan_a_net_worth"`
	PlanBNetWorth    float64 `json:"plan_b_net_worth"`
	PlanATotalDebt   float64 `json:"plan_a_total_debt"`
	PlanBTotalDebt   float64 `json:"plan_b_total_debt"`
	PlanAInvestments float64 `json:"plan_a_investments"`
	PlanBInvestments float64 `json:"plan_b_investments"`
	NetWorthDelta    float64 `json:"net_worth_delta"` // plan_b - plan_a
}

// PlanComparisonFull is an extended plan comparison including optional full snapshots.
type PlanComparisonFull struct {
	PlanAID        uuid.UUID          `json:"plan_a_id"`
	PlanBID        uuid.UUID          `json:"plan_b_id"`
	FullDeltas     []HorizonDeltaFull `json:"full_deltas"`
	PlanASnapshots []MonthSnapshot    `json:"plan_a_snapshots,omitempty"`
	PlanBSnapshots []MonthSnapshot    `json:"plan_b_snapshots,omitempty"`
}

// RepaymentPlanSummary summarises the outcome of a single repayment strategy.
type RepaymentPlanSummary struct {
	PlanName          string  `json:"plan_name"`
	TotalInterestPaid float64 `json:"total_interest_paid"`
	ForgivenessAmount float64 `json:"forgiveness_amount"`
	ForgivenessMonth  int     `json:"forgiveness_month"` // -1 if no forgiveness within horizon
	NetWorth30yr      float64 `json:"net_worth_30yr"`
	DebtFreeMonth     int     `json:"debt_free_month"` // -1 if not paid off within horizon
	CurrentStrategy   bool    `json:"current_strategy"`
}

// RepaymentComparison holds the side-by-side results across all IDR strategies.
type RepaymentComparison struct {
	Plans []RepaymentPlanSummary `json:"plans"`
}

// GoalProgress tracks a savings-goal account's progress toward its target.
type GoalProgress struct {
	AccountID        string  `json:"account_id"`
	Name             string  `json:"name"`
	GoalLabel        string  `json:"goal_label"`
	TargetBalance    float64 `json:"target_balance"`
	CurrentBalance   float64 `json:"current_balance"`   // balance at plan start
	ProjectedBalance float64 `json:"projected_balance"` // balance at end of horizon
	ReachedMonth     int     `json:"reached_month"`     // -1 if not reached within horizon
}

// SocialSecurityEstimate is the result of the SS benefit estimation endpoint.
type SocialSecurityEstimate struct {
	MonthlyBenefit  float64 `json:"monthly_benefit"`
	RetirementMonth int     `json:"retirement_month"`
	AIME            float64 `json:"aime"` // Average Indexed Monthly Earnings used in calculation
}

// SimulateOverrideRequest is the body for the what-if sensitivity endpoint.
type SimulateOverrideRequest struct {
	ExtraPaymentDelta       float64  `json:"extra_payment_delta"`
	StockReturnOverride     *float64 `json:"stock_return_override"`
	IncomeGrowthOverride    *float64 `json:"income_growth_override"`
	ContributionMultiplier  float64  `json:"contribution_multiplier"`  // 1.0 = no change
	UnforeseenExpenseMonthly float64 `json:"unforeseen_expense_monthly"` // extra monthly expense shock
}
