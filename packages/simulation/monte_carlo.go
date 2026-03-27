package simulation

import (
	"math"
	"math/rand"
	"sort"
)

// MCConfig holds the parameters for a Monte Carlo simulation run.
type MCConfig struct {
	Passes          int
	StockMeanAnnual float64 // e.g. 0.07
	StockStdAnnual  float64 // e.g. 0.15
	BondMeanAnnual  float64 // e.g. 0.04
	BondStdAnnual   float64 // e.g. 0.06
	CashMeanAnnual  float64 // e.g. 0.05
}

// MCMonthInput holds the fixed (non-random) inputs for a single simulation month.
// The MC engine varies only the investment return; everything else is deterministic.
type MCMonthInput struct {
	Contribution   float64
	StockPct       float64
	BondPct        float64
	CashPct        float64
	StartingBalance float64 // balance at start of this month
}

// RunMonteCarlo runs Passes independent simulations over the provided monthly inputs
// and returns the P10/P25/P50/P75/P90 net worth at each month across all passes.
//
// monthInputs should have one entry per simulated month (horizon * 12).
// The debt and expense trajectory is fixed across all runs (only investment returns vary).
func RunMonteCarlo(cfg MCConfig, monthInputs []MCMonthInput, baseNetDebt []float64) MCResult {
	numMonths := len(monthInputs)
	if numMonths == 0 || cfg.Passes == 0 {
		return MCResult{}
	}

	// Convert annual params to monthly
	stockMeanMonthly := MonthlyReturn(cfg.StockMeanAnnual)
	stockStdMonthly := cfg.StockStdAnnual / math.Sqrt(12)
	bondMeanMonthly := MonthlyReturn(cfg.BondMeanAnnual)
	bondStdMonthly := cfg.BondStdAnnual / math.Sqrt(12)
	cashMeanMonthly := MonthlyReturn(cfg.CashMeanAnnual)

	// allNetWorths[month][pass] = net worth
	allNetWorths := make([][]float64, numMonths)
	for i := range allNetWorths {
		allNetWorths[i] = make([]float64, cfg.Passes)
	}

	rng := rand.New(rand.NewSource(42)) // deterministic seed for reproducibility

	for pass := 0; pass < cfg.Passes; pass++ {
		balance := monthInputs[0].StartingBalance

		for m, input := range monthInputs {
			// Sample monthly returns from normal distribution
			stockRet := stockMeanMonthly + stockStdMonthly*rng.NormFloat64()
			bondRet := bondMeanMonthly + bondStdMonthly*rng.NormFloat64()
			cashRet := cashMeanMonthly // cash doesn't have meaningful volatility

			balance = CompoundMonth(
				balance,
				stockRet, bondRet, cashRet,
				input.StockPct, input.BondPct, input.CashPct,
				input.Contribution,
			)

			// Net worth = investment balance - remaining debt
			debtBalance := 0.0
			if m < len(baseNetDebt) {
				debtBalance = baseNetDebt[m]
			}
			allNetWorths[m][pass] = balance - debtBalance
		}
	}

	// Compute percentiles at each month
	result := MCResult{
		Passes: cfg.Passes,
		P10:    make([]float64, numMonths),
		P25:    make([]float64, numMonths),
		P50:    make([]float64, numMonths),
		P75:    make([]float64, numMonths),
		P90:    make([]float64, numMonths),
	}

	for m := 0; m < numMonths; m++ {
		sorted := make([]float64, cfg.Passes)
		copy(sorted, allNetWorths[m])
		sort.Float64s(sorted)

		result.P10[m] = percentile(sorted, 10)
		result.P25[m] = percentile(sorted, 25)
		result.P50[m] = percentile(sorted, 50)
		result.P75[m] = percentile(sorted, 75)
		result.P90[m] = percentile(sorted, 90)
	}

	return result
}

// MCResult holds the percentile bands from a Monte Carlo run.
type MCResult struct {
	Passes int
	P10    []float64
	P25    []float64
	P50    []float64
	P75    []float64
	P90    []float64
}

// percentile returns the p-th percentile value from a sorted slice (0-100).
func percentile(sorted []float64, p int) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := float64(p) / 100.0 * float64(len(sorted)-1)
	lo := int(math.Floor(idx))
	hi := int(math.Ceil(idx))
	if lo == hi {
		return sorted[lo]
	}
	frac := idx - float64(lo)
	return sorted[lo]*(1-frac) + sorted[hi]*frac
}
