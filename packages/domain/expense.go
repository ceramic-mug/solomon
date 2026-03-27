package domain

import "github.com/google/uuid"

// ExpenseCategory classifies what a recurring expense is for.
type ExpenseCategory string

const (
	ExpenseCategoryHousing      ExpenseCategory = "housing"
	ExpenseCategoryFood         ExpenseCategory = "food"
	ExpenseCategoryTransport    ExpenseCategory = "transport"
	ExpenseCategoryHealthcare   ExpenseCategory = "healthcare"
	ExpenseCategoryInsurance    ExpenseCategory = "insurance"
	ExpenseCategoryChildcare    ExpenseCategory = "childcare"
	ExpenseCategoryEducation    ExpenseCategory = "education"
	ExpenseCategorySubscription ExpenseCategory = "subscription"
	ExpenseCategoryUtilities    ExpenseCategory = "utilities"
	ExpenseCategoryPersonal     ExpenseCategory = "personal"
	ExpenseCategoryTravel       ExpenseCategory = "travel"
	ExpenseCategoryOther        ExpenseCategory = "other"
)

// Expense is a recurring monthly outflow within a plan.
// StartMonth and EndMonth are 0-indexed month offsets from plan start.
type Expense struct {
	ID            uuid.UUID       `json:"id"`
	PlanID        uuid.UUID       `json:"plan_id"`
	Name          string          `json:"name"`
	Category      ExpenseCategory `json:"category"`
	MonthlyAmount float64         `json:"monthly_amount"`
	GrowthRate    float64         `json:"growth_rate"` // inflation adjustment per year
	StartMonth    int             `json:"start_month"`
	EndMonth      *int            `json:"end_month,omitempty"`
	IsOneTime     bool            `json:"is_one_time"` // true = single-month lump sum
}

// AmountAtMonth returns the monthly expense amount for a given simulation month.
func (e Expense) AmountAtMonth(month int) float64 {
	if month < e.StartMonth {
		return 0
	}
	if e.EndMonth != nil && month > *e.EndMonth {
		return 0
	}
	if e.IsOneTime && month != e.StartMonth {
		return 0
	}
	return e.MonthlyAmount
}
