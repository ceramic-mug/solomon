package simulation

import "math"

// AmortizationStep holds the result of processing one month's debt payment.
type AmortizationStep struct {
	InterestCharge float64 // interest accrued this month
	PrincipalPaid  float64 // principal reduced this month
	TotalPaid      float64 // total cash out (interest + principal)
	NewBalance     float64 // remaining balance after payment
	PaidOff        bool    // true when balance reaches zero
}

// ProcessDebtMonth applies one month of debt service to a loan.
// payment is the total cash applied (min payment + any extra).
// If payment > balance + interest, it clips to exactly pay off the loan.
func ProcessDebtMonth(balance, annualRate, payment float64) AmortizationStep {
	if balance <= 0 {
		return AmortizationStep{PaidOff: true}
	}

	monthlyRate := annualRate / 12
	interest := balance * monthlyRate

	// Can't pay more than what's owed
	maxPayment := balance + interest
	if payment > maxPayment {
		payment = maxPayment
	}

	principal := payment - interest
	if principal < 0 {
		principal = 0
	}

	newBalance := balance - principal
	if newBalance < 0.01 { // treat sub-cent balances as paid off
		newBalance = 0
	}

	return AmortizationStep{
		InterestCharge: interest,
		PrincipalPaid:  principal,
		TotalPaid:      payment,
		NewBalance:     newBalance,
		PaidOff:        newBalance == 0,
	}
}

// StandardPayment computes the fixed amortized monthly payment that pays off
// a loan in exactly n months at the given annual interest rate.
// Formula: M = P * J / (1 - (1+J)^-N)
func StandardPayment(principal, annualRate float64, months int) float64 {
	if principal <= 0 || months <= 0 {
		return 0
	}
	j := annualRate / 12
	if j == 0 {
		return principal / float64(months)
	}
	return principal * j / (1 - math.Pow(1+j, -float64(months)))
}

// RemainingMonths estimates how many months remain on a loan given current
// balance, monthly rate, and payment amount. Returns 0 if already paid off.
func RemainingMonths(balance, annualRate, monthlyPayment float64) int {
	if balance <= 0 {
		return 0
	}
	j := annualRate / 12
	if j == 0 {
		if monthlyPayment <= 0 {
			return 1<<31 - 1 // effectively infinite
		}
		return int(math.Ceil(balance / monthlyPayment))
	}
	if monthlyPayment <= balance*j {
		return 1<<31 - 1 // payment doesn't cover interest — never pays off
	}
	// n = -ln(1 - P*j/M) / ln(1+j)
	n := -math.Log(1-balance*j/monthlyPayment) / math.Log(1+j)
	return int(math.Ceil(n))
}
