package domain

import (
	"github.com/google/uuid"
)

// IncomeType classifies the nature of an income stream.
type IncomeType string

const (
	IncomeTypeSalary     IncomeType = "salary"
	IncomeTypeBonus      IncomeType = "bonus"
	IncomeTypeSideIncome IncomeType = "side_income"
	IncomeTypeInvestment IncomeType = "investment"
	IncomeTypeRental     IncomeType = "rental"
	IncomeTypeOther      IncomeType = "other"
)

// TaxCategory determines how income is taxed.
type TaxCategory string

const (
	TaxCategoryW2            TaxCategory = "w2"             // Standard employee — withholding + FICA
	TaxCategorySelfEmployed  TaxCategory = "self_employed"  // SE tax (15.3% FICA + income tax)
	TaxCategoryPassive       TaxCategory = "passive"        // Rental, dividends — no FICA
	TaxCategoryCapitalGains  TaxCategory = "capital_gains"  // Long-term capital gains rates
)

// IncomeStream represents a recurring source of income within a plan.
// StartMonth and EndMonth are 0-indexed month offsets from the plan's StartDate.
// EndMonth = nil means the stream continues for the full simulation horizon.
type IncomeStream struct {
	ID          uuid.UUID  `json:"id"`
	PlanID      uuid.UUID  `json:"plan_id"`
	Name        string     `json:"name"`   // e.g. "Residency Salary", "Attending Salary"
	Type        IncomeType `json:"type"`
	TaxCategory TaxCategory `json:"tax_category"`
	Amount      float64    `json:"amount"`      // monthly gross
	GrowthRate  float64    `json:"growth_rate"` // annual % raise, e.g. 0.03
	StartMonth  int        `json:"start_month"` // 0 = plan start
	EndMonth    *int       `json:"end_month,omitempty"`
}

// IsActiveAtMonth returns true if this income stream is active at the given month.
func (s IncomeStream) IsActiveAtMonth(month int) bool {
	if month < s.StartMonth {
		return false
	}
	if s.EndMonth != nil && month > *s.EndMonth {
		return false
	}
	return true
}
