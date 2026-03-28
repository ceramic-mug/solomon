// Package simulation implements the core financial math engine for Solomon.
// All functions are pure (no side effects, no I/O) and operate on domain types.
package simulation

// TaxInput contains the inputs needed to compute a single month's tax liability.
type TaxInput struct {
	AnnualGross      float64 // full-year gross (extrapolated from monthly for bracket lookup)
	PreTaxDeductions float64 // annual 401k + HSA + pre-tax health insurance
	FilingStatus     FilingStatus
	StateTaxRate     float64 // flat rate, e.g. 0.05
}

// TaxOutput is the result of a tax calculation for one month.
type TaxOutput struct {
	FederalIncomeTax float64
	FICA             float64 // Social Security (6.2%) + Medicare (1.45%)
	StateTax         float64
	TotalMonthly     float64 // sum / 12
}

// FilingStatus mirrors the IRS filing categories that affect bracket thresholds.
type FilingStatus string

const (
	FilingStatusSingle            FilingStatus = "single"
	FilingStatusMarriedFilingJointly FilingStatus = "mfj"
	FilingStatusMarriedFilingSeparately FilingStatus = "mfs"
	FilingStatusHeadOfHousehold   FilingStatus = "hoh"
)

// 2026 federal tax brackets (taxable income after standard deduction).
// Source: IRS Rev. Proc. 2025-XX (estimates based on 2025 brackets + ~2.8% inflation).
var brackets2026 = map[FilingStatus][]bracket{
	FilingStatusSingle: {
		{0, 11925, 0.10},
		{11925, 48475, 0.12},
		{48475, 103350, 0.22},
		{103350, 197300, 0.24},
		{197300, 250525, 0.32},
		{250525, 626350, 0.35},
		{626350, 1<<62, 0.37},
	},
	FilingStatusMarriedFilingJointly: {
		{0, 23850, 0.10},
		{23850, 96950, 0.12},
		{96950, 206700, 0.22},
		{206700, 394600, 0.24},
		{394600, 501050, 0.32},
		{501050, 751600, 0.35},
		{751600, 1<<62, 0.37},
	},
	FilingStatusMarriedFilingSeparately: {
		{0, 11925, 0.10},
		{11925, 48475, 0.12},
		{48475, 103350, 0.22},
		{103350, 197300, 0.24},
		{197300, 250525, 0.32},
		{250525, 375800, 0.35},
		{375800, 1<<62, 0.37},
	},
	FilingStatusHeadOfHousehold: {
		{0, 17000, 0.10},
		{17000, 64850, 0.12},
		{64850, 103350, 0.22},
		{103350, 197300, 0.24},
		{197300, 250500, 0.32},
		{250500, 626350, 0.35},
		{626350, 1<<62, 0.37},
	},
}

// 2026 standard deductions
var standardDeductions2026 = map[FilingStatus]float64{
	FilingStatusSingle:                    15000,
	FilingStatusMarriedFilingJointly:      30000,
	FilingStatusMarriedFilingSeparately:   15000,
	FilingStatusHeadOfHousehold:           22500,
}

// FICA constants (2026)
const (
	socialSecurityRate   = 0.062  // employee share
	medicareRate         = 0.0145 // employee share
	socialSecurityWageCap = 176100 // 2026 SS wage base (estimated)
	additionalMedicareRate = 0.009 // additional 0.9% above $200k single / $250k MFJ
)

type bracket struct {
	low, high float64
	rate      float64
}

// CalculateTax computes federal income tax, FICA, and state tax for a given annual income.
// Returns monthly amounts (annual / 12) so the engine can apply them per month.
func CalculateTax(in TaxInput) TaxOutput {
	// Step 1: AGI = gross - pre-tax deductions
	agi := in.AnnualGross - in.PreTaxDeductions
	if agi < 0 {
		agi = 0
	}

	// Step 2: Taxable income = AGI - standard deduction
	stdDeduction := standardDeductions2026[in.FilingStatus]
	if stdDeduction == 0 {
		stdDeduction = standardDeductions2026[FilingStatusSingle]
	}
	taxableIncome := agi - stdDeduction
	if taxableIncome < 0 {
		taxableIncome = 0
	}

	// Step 3: Marginal federal tax
	federalTax := marginalTax(taxableIncome, brackets2026[in.FilingStatus])

	// Step 4: FICA (applies to gross W2 wages, not AGI)
	ssWages := in.AnnualGross
	if ssWages > socialSecurityWageCap {
		ssWages = socialSecurityWageCap
	}
	fica := ssWages*socialSecurityRate + in.AnnualGross*medicareRate

	// Additional Medicare surtax above threshold
	var additionalMedicare float64
	threshold := 200000.0
	if in.FilingStatus == FilingStatusMarriedFilingJointly {
		threshold = 250000
	}
	if in.AnnualGross > threshold {
		additionalMedicare = (in.AnnualGross - threshold) * additionalMedicareRate
	}
	fica += additionalMedicare

	// Step 5: State tax (flat rate on AGI)
	stateTax := agi * in.StateTaxRate

	total := federalTax + fica + stateTax
	return TaxOutput{
		FederalIncomeTax: federalTax / 12,
		FICA:             fica / 12,
		StateTax:         stateTax / 12,
		TotalMonthly:     total / 12,
	}
}

// marginalTax applies progressive brackets to compute total federal income tax.
func marginalTax(income float64, bs []bracket) float64 {
	tax := 0.0
	for _, b := range bs {
		if income <= 0 {
			break
		}
		top := b.high - b.low
		taxable := income
		if taxable > top {
			taxable = top
		}
		tax += taxable * b.rate
		income -= taxable
	}
	return tax
}

// IDRMonthlyPayment calculates the Income-Driven Repayment monthly payment.
// Kept as an alias for PAYE behavior (10% at 150% poverty, no Standard cap).
// Use PAYEMonthlyPayment for the correct PAYE cap, or SAVEMonthlyPayment for SAVE.
func IDRMonthlyPayment(agi float64, povertyGuideline float64) float64 {
	discretionary := agi - 1.5*povertyGuideline
	if discretionary <= 0 {
		return 0
	}
	return (discretionary * 0.10) / 12
}

// PAYEMonthlyPayment calculates the Pay As You Earn monthly payment:
// 10% × max(0, AGI - 150% poverty) / 12, capped at the Standard 10-year payment.
func PAYEMonthlyPayment(agi, povertyGuideline, standardPaymentCap float64) float64 {
	discretionary := agi - 1.5*povertyGuideline
	if discretionary <= 0 {
		return 0
	}
	payment := (discretionary * 0.10) / 12
	if standardPaymentCap > 0 && payment > standardPaymentCap {
		payment = standardPaymentCap
	}
	return payment
}

// SAVEMonthlyPayment calculates the SAVE plan monthly payment:
// 10% × max(0, AGI - 225% poverty) / 12, no cap.
func SAVEMonthlyPayment(agi, povertyGuideline float64) float64 {
	discretionary := agi - 2.25*povertyGuideline
	if discretionary <= 0 {
		return 0
	}
	return (discretionary * 0.10) / 12
}

// IBRNewMonthlyPayment calculates the IBR (New Borrower) monthly payment:
// 10% × max(0, AGI - 150% poverty) / 12, no Standard-payment cap.
func IBRNewMonthlyPayment(agi, povertyGuideline float64) float64 {
	discretionary := agi - 1.5*povertyGuideline
	if discretionary <= 0 {
		return 0
	}
	return (discretionary * 0.10) / 12
}

// PovertyGuideline2026 returns the annual federal poverty guideline for the contiguous US
// for a given household size (2026 estimates; 2025 values + ~3% inflation).
func PovertyGuideline2026(householdSize int) float64 {
	base := 15650.0 // 1 person
	perPerson := 5550.0
	if householdSize <= 1 {
		return base
	}
	return base + perPerson*float64(householdSize-1)
}
