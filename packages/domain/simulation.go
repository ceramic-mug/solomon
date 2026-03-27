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
}

// SimulationResult is the output of a full simulation run for a plan.
type SimulationResult struct {
	ID              uuid.UUID       `json:"id"`
	PlanID          uuid.UUID       `json:"plan_id"`
	MonthlySnapshot []MonthSnapshot `json:"monthly_snapshots"`

	// Monte Carlo percentile bands (nil if MC was not run)
	MonteCarlo *MonteCarloResult `json:"monte_carlo,omitempty"`
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
	Year         int     `json:"year"`
	PlanANetWorth float64 `json:"plan_a_net_worth"`
	PlanBNetWorth float64 `json:"plan_b_net_worth"`
	Delta         float64 `json:"delta"` // plan_b - plan_a
}
