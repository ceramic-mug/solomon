package simulation

import "math"

// MonthlyReturn converts an annual return rate to an equivalent monthly rate.
// Uses the geometric formula: (1 + annual)^(1/12) - 1
func MonthlyReturn(annualRate float64) float64 {
	return math.Pow(1+annualRate, 1.0/12.0) - 1
}

// CompoundMonth applies one month of investment returns to a starting balance,
// then adds contributions. Returns the new balance.
//
// stockReturn and bondReturn are monthly rates (not annual).
// alloc is the asset allocation fractions (must sum to ~1.0).
func CompoundMonth(balance, stockMonthlyReturn, bondMonthlyReturn, cashMonthlyReturn float64,
	stockPct, bondPct, cashPct float64, contribution float64) float64 {

	if balance < 0 {
		balance = 0
	}

	// Weighted blended return for the period
	blendedReturn := stockPct*stockMonthlyReturn +
		bondPct*bondMonthlyReturn +
		cashPct*cashMonthlyReturn

	// Apply return to existing balance, then add contribution
	return balance*(1+blendedReturn) + contribution
}

// RealValue converts a nominal future value to today's purchasing power.
// inflationRate is annual, years is time horizon.
func RealValue(nominalValue, inflationRate, years float64) float64 {
	if years <= 0 {
		return nominalValue
	}
	return nominalValue / math.Pow(1+inflationRate, years)
}

// FutureValue computes the future value of a lump sum after n months.
func FutureValue(presentValue, monthlyRate float64, months int) float64 {
	return presentValue * math.Pow(1+monthlyRate, float64(months))
}

// AnnualizedReturn converts a total return over n months to an equivalent annual return.
func AnnualizedReturn(totalReturn float64, months int) float64 {
	if months <= 0 {
		return 0
	}
	return math.Pow(1+totalReturn, 12.0/float64(months)) - 1
}
