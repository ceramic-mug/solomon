package simulation

// PSLFRequiredPayments is the number of qualifying payments needed for PSLF forgiveness.
const PSLFRequiredPayments = 120

// PSLFState tracks qualifying payment progress for a single student loan under PSLF.
type PSLFState struct {
	QualifyingPayments int     // cumulative count (pre-existing + simulation)
	RemainingBalance   float64 // balance remaining at time of forgiveness (if any)
	ForgivenAt         int     // simulation month when forgiveness occurs (-1 if not yet)
	AmountForgiven     float64
}

// PSLFEligibleEmployer returns true if the given employer type qualifies for PSLF.
// In practice, residency programs at nonprofit hospitals (501c3) qualify.
// This is modeled as a simple flag on the plan rather than employer lookup.
// The flag is already stored on DebtAccount.PSLFEligible.
func PSLFEligibleEmployer(eligible bool) bool {
	return eligible
}

// ProcessPSLFMonth advances one PSLF-eligible month, counting the payment if:
//  1. The employer is eligible
//  2. The loan is on a qualifying repayment plan (IDR/PAYE/SAVE)
//  3. A payment was made this month (amount > 0)
//
// Returns the updated state. Forgiveness is set when qualifying payments reach 120.
func ProcessPSLFMonth(state PSLFState, paymentMade float64, balance float64, isEligible bool, month int) PSLFState {
	if !isEligible || state.ForgivenAt >= 0 {
		state.RemainingBalance = balance
		return state
	}

	// Under qualifying IDR/PAYE/SAVE plans, a $0 calculated payment still counts
	// as a qualifying PSLF payment (the government covers unpaid interest under SAVE).
	// The caller only reaches here when the loan is on a qualifying plan and employer is eligible.
	if paymentMade >= 0 {
		state.QualifyingPayments++
	}

	state.RemainingBalance = balance

	if state.QualifyingPayments >= PSLFRequiredPayments && balance > 0 {
		state.ForgivenAt = month
		state.AmountForgiven = balance
		state.RemainingBalance = 0
	}

	return state
}

// PSLFForgivenessSummary summarizes the PSLF trajectory for reporting and comparison.
type PSLFForgivenessSummary struct {
	// Estimated month of forgiveness from plan start
	ProjectedForgivenessMonth int
	// Balance expected to be forgiven (nominal, not inflation-adjusted)
	ProjectedAmountForgiven float64
	// Total payments made before forgiveness
	TotalPaymentsMade float64
	// Remaining qualifying payments needed
	PaymentsRemaining int
}

// ProjectPSLF estimates when forgiveness will occur given current PSLF state and monthly payment.
func ProjectPSLF(state PSLFState, monthlyPayment, currentBalance float64, annualRate float64) PSLFForgivenessSummary {
	remaining := PSLFRequiredPayments - state.QualifyingPayments
	if remaining < 0 {
		remaining = 0
	}

	// Project balance at forgiveness using loan amortization
	balance := currentBalance
	totalPaid := 0.0
	for i := 0; i < remaining; i++ {
		step := ProcessDebtMonth(balance, annualRate, monthlyPayment)
		totalPaid += step.TotalPaid
		balance = step.NewBalance
		if step.PaidOff {
			// Loan paid off before forgiveness — no forgiveness occurs
			return PSLFForgivenessSummary{
				ProjectedForgivenessMonth: -1,
				PaymentsRemaining:        remaining - i,
			}
		}
	}

	return PSLFForgivenessSummary{
		ProjectedForgivenessMonth: remaining,
		ProjectedAmountForgiven:   balance,
		TotalPaymentsMade:         totalPaid,
		PaymentsRemaining:         remaining,
	}
}
