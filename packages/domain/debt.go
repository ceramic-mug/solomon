package domain

import "github.com/google/uuid"

// DebtType classifies a debt account.
type DebtType string

const (
	DebtTypeStudentLoan DebtType = "student_loan"
	DebtTypeMortgage    DebtType = "mortgage"
	DebtTypeAuto        DebtType = "auto"
	DebtTypeCreditCard  DebtType = "credit_card"
	DebtTypePersonal    DebtType = "personal"
	DebtTypeOther       DebtType = "other"
)

// RepaymentPlan governs how a student loan payment is calculated.
// For non-student loans, use RepaymentPlanStandard.
type RepaymentPlan string

const (
	RepaymentPlanStandard RepaymentPlan = "standard" // Fixed amortized payment
	RepaymentPlanIDR      RepaymentPlan = "idr"      // Income-Driven Repayment (alias for PAYE behavior)
	RepaymentPlanPAYE     RepaymentPlan = "paye"     // Pay As You Earn (10%, capped at Standard payment)
	RepaymentPlanSAVE     RepaymentPlan = "save"     // Saving on a Valuable Education (10% at 225% poverty, no cap)
	RepaymentPlanIBRNew   RepaymentPlan = "ibr_new"  // IBR New Borrowers (10% at 150% poverty, no cap)
)

// DebtAccount represents a single loan or credit liability within a plan.
type DebtAccount struct {
	ID               uuid.UUID     `json:"id"`
	PlanID           uuid.UUID     `json:"plan_id"`
	Name             string        `json:"name"`
	Type             DebtType      `json:"type"`
	OriginalPrincipal float64      `json:"original_principal"`
	Balance          float64       `json:"balance"`          // current remaining balance
	InterestRate     float64       `json:"interest_rate"`    // annual rate, e.g. 0.065
	MinPayment       float64       `json:"min_payment"`      // monthly minimum (for standard plan; overridden by IDR calc)
	ExtraPayment     float64       `json:"extra_payment"`    // additional monthly principal payment
	StartMonth       int           `json:"start_month"`      // when this debt begins accruing in the simulation
	RepaymentPlan    RepaymentPlan `json:"repayment_plan"`

	// PSLF tracking — applies to student loans at qualifying employers
	PSLFEligible     bool `json:"pslf_eligible"`
	PSLFPaymentsMade int  `json:"pslf_payments_made"` // qualifying payments already made before plan start

	// Mortgage-specific fields (only meaningful when Type == DebtTypeMortgage)
	PropertyValue    float64 `json:"property_value"`    // current estimated property value
	AppreciationRate float64 `json:"appreciation_rate"` // annual appreciation rate, e.g. 0.03
}

// MonthlyInterest returns the interest that accrues in one month on a given balance.
func (d DebtAccount) MonthlyInterest(balance float64) float64 {
	return balance * (d.InterestRate / 12)
}

// StandardPayment returns the fixed amortized monthly payment for the standard plan.
// Uses the standard amortization formula: M = P * J / (1 - (1+J)^-N)
// where J = monthly rate, N = remaining months.
func (d DebtAccount) StandardPayment(balance float64, remainingMonths int) float64 {
	if balance <= 0 || remainingMonths <= 0 {
		return 0
	}
	j := d.InterestRate / 12
	if j == 0 {
		return balance / float64(remainingMonths)
	}
	// (1+j)^-N
	denomBase := 1 + j
	denomPow := 1.0
	for i := 0; i < remainingMonths; i++ {
		denomPow /= denomBase
	}
	return balance * j / (1 - denomPow)
}
