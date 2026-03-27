package simulation_test

import (
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/solomon/domain"
	"github.com/solomon/simulation"
)

// ---- Helpers ----

func stockAlloc() domain.AssetAllocation {
	return domain.AssetAllocation{StockPct: 0.90, BondPct: 0.08, CashPct: 0.02}
}

func basePlan() domain.Plan {
	id := uuid.New()
	return domain.Plan{
		ID:        id,
		ProfileID: uuid.New(),
		Name:      "Test Plan",
		SimulationConfig: domain.SimulationConfig{
			ID:               uuid.New(),
			PlanID:           id,
			StartYear:        2026,
			StartMonth:       7,
			HorizonYears:     10,
			InflationRate:    0.03,
			MonteCarloPasses: 0, // disabled by default in tests
			StockMeanReturn:  0.07,
			StockStdDev:      0.15,
			BondMeanReturn:   0.04,
			BondStdDev:       0.06,
		},
	}
}

func baseOpts() simulation.RunOptions {
	return simulation.RunOptions{
		FilingStatus:  simulation.FilingStatusMarriedFilingJointly,
		HouseholdSize: 2,
		StateTaxRate:  0.0,
	}
}

// ---- Amortization tests ----

func TestStandardPayment_KnownValues(t *testing.T) {
	// $200,000 mortgage at 6.5% for 30 years.
	// Expected monthly payment ≈ $1,264.14 (well-known reference value).
	payment := simulation.StandardPayment(200_000, 0.065, 360)
	expected := 1264.14
	if math.Abs(payment-expected) > 1.0 {
		t.Errorf("StandardPayment(200k, 6.5%%, 360) = %.2f, want ~%.2f", payment, expected)
	}
}

func TestProcessDebtMonth_PaysInterestAndPrincipal(t *testing.T) {
	// $10,000 at 6% annual rate with $200/month payment
	step := simulation.ProcessDebtMonth(10_000, 0.06, 200)
	expectedInterest := 10_000 * (0.06 / 12) // = 50
	expectedPrincipal := 200.0 - 50.0 // = 150

	if math.Abs(step.InterestCharge-expectedInterest) > 0.01 {
		t.Errorf("interest = %.2f, want %.2f", step.InterestCharge, expectedInterest)
	}
	if math.Abs(step.PrincipalPaid-expectedPrincipal) > 0.01 {
		t.Errorf("principal = %.2f, want %.2f", step.PrincipalPaid, expectedPrincipal)
	}
	if math.Abs(step.NewBalance-9_850) > 0.01 {
		t.Errorf("new balance = %.2f, want 9850.00", step.NewBalance)
	}
}

func TestProcessDebtMonth_ZeroBalance(t *testing.T) {
	step := simulation.ProcessDebtMonth(0, 0.06, 200)
	if !step.PaidOff {
		t.Error("expected PaidOff=true for zero balance")
	}
}

func TestProcessDebtMonth_OverpaymentClips(t *testing.T) {
	// $100 balance — paying $500 should not go negative
	step := simulation.ProcessDebtMonth(100, 0.06, 500)
	if step.NewBalance != 0 {
		t.Errorf("expected NewBalance=0 on overpayment, got %.2f", step.NewBalance)
	}
	if !step.PaidOff {
		t.Error("expected PaidOff=true on overpayment")
	}
}

// ---- Tax tests ----

func TestCalculateTax_ZeroIncome(t *testing.T) {
	out := simulation.CalculateTax(simulation.TaxInput{
		AnnualGross:  0,
		FilingStatus: simulation.FilingStatusSingle,
	})
	if out.TotalMonthly != 0 {
		t.Errorf("zero income should produce zero tax, got %.2f", out.TotalMonthly)
	}
}

func TestCalculateTax_ResidentIncome(t *testing.T) {
	// $75,000/year resident salary (W2, MFJ, no state tax)
	out := simulation.CalculateTax(simulation.TaxInput{
		AnnualGross:      75_000,
		PreTaxDeductions: 3_500, // ~$292/mo pre-tax
		FilingStatus:     simulation.FilingStatusMarriedFilingJointly,
		StateTaxRate:     0,
	})

	// Monthly federal + FICA should be in the ballpark of ~$900-1200
	monthlyTotal := out.TotalMonthly
	if monthlyTotal < 500 || monthlyTotal > 1500 {
		t.Errorf("resident tax out of expected range: $%.2f/month", monthlyTotal)
	}
	t.Logf("Resident ($75k MFJ): federal=%.2f/mo, FICA=%.2f/mo, total=%.2f/mo",
		out.FederalIncomeTax, out.FICA, out.TotalMonthly)
}

func TestCalculateTax_AttendingIncome(t *testing.T) {
	// $400,000/year attending (MFJ, no state tax, $46k pre-tax)
	out := simulation.CalculateTax(simulation.TaxInput{
		AnnualGross:      400_000,
		PreTaxDeductions: 46_000, // max 403b + 457b
		FilingStatus:     simulation.FilingStatusMarriedFilingJointly,
		StateTaxRate:     0.05,
	})

	annualTotal := out.TotalMonthly * 12
	// Effective rate should be substantial but not exceed 40%
	if annualTotal < 80_000 || annualTotal > 160_000 {
		t.Errorf("attending annual tax out of expected range: $%.0f", annualTotal)
	}
	t.Logf("Attending ($400k MFJ, 5%% state): federal=%.0f, FICA=%.0f, state=%.0f, total/yr=%.0f",
		out.FederalIncomeTax*12, out.FICA*12, out.StateTax*12, annualTotal)
}

func TestIDRMonthlyPayment_Resident(t *testing.T) {
	// Resident AGI $70k, family of 2, poverty guideline ~$21,200
	poverty := simulation.PovertyGuideline2026(2)
	payment := simulation.IDRMonthlyPayment(70_000, poverty)

	// Discretionary = 70000 - 1.5*21200 = 70000 - 31800 = 38200
	// IDR payment = 38200 * 0.10 / 12 ≈ $318/mo
	expected := 38200.0 * 0.10 / 12
	if math.Abs(payment-expected) > 1.0 {
		t.Errorf("IDR payment = %.2f, want ~%.2f", payment, expected)
	}
}

// ---- Compound tests ----

func TestMonthlyReturn(t *testing.T) {
	// 7% annual → monthly ≈ 0.5654%
	monthly := simulation.MonthlyReturn(0.07)
	expected := 0.005654
	if math.Abs(monthly-expected) > 0.0001 {
		t.Errorf("MonthlyReturn(0.07) = %.6f, want ~%.6f", monthly, expected)
	}
}

func TestCompoundMonth_NoContribution(t *testing.T) {
	// $100k at 7% annual stock return over 1 month, no contribution
	stockRet := simulation.MonthlyReturn(0.07)
	balance := simulation.CompoundMonth(100_000, stockRet, 0, 0, 1.0, 0, 0, 0)
	expected := 100_000 * (1 + stockRet)
	if math.Abs(balance-expected) > 0.01 {
		t.Errorf("compound = %.2f, want %.2f", balance, expected)
	}
}

// ---- Full engine integration tests ----

func TestEngine_EmptyPlan_NoIncome(t *testing.T) {
	plan := basePlan()
	result := simulation.Run(plan, baseOpts())

	if len(result.MonthlySnapshot) != 10*12 {
		t.Errorf("expected 120 monthly snapshots, got %d", len(result.MonthlySnapshot))
	}

	// No income, no investments, no debt → net worth should be 0 throughout
	for _, snap := range result.MonthlySnapshot {
		if snap.NetWorth != 0 {
			t.Errorf("month %d: expected net worth 0, got %.2f", snap.Month, snap.NetWorth)
		}
	}
}

func TestEngine_SingleIncome_NoDebt(t *testing.T) {
	plan := basePlan()
	plan.IncomeStreams = []domain.IncomeStream{
		{
			ID:          uuid.New(),
			PlanID:      plan.ID,
			Name:        "Residency Salary",
			Type:        domain.IncomeTypeSalary,
			TaxCategory: domain.TaxCategoryW2,
			Amount:      6250, // $75k/yr gross
			GrowthRate:  0.03,
			StartMonth:  0,
		},
	}

	result := simulation.Run(plan, baseOpts())
	first := result.MonthlySnapshot[0]
	last := result.MonthlySnapshot[len(result.MonthlySnapshot)-1]

	if first.GrossIncome < 6000 || first.GrossIncome > 6500 {
		t.Errorf("first month gross income = %.2f, expected ~6250", first.GrossIncome)
	}
	// With 3% annual growth over 10 years, income should increase
	if last.GrossIncome <= first.GrossIncome {
		t.Errorf("income should grow over time; first=%.2f last=%.2f", first.GrossIncome, last.GrossIncome)
	}
	// Net income should be less than gross (taxes applied)
	if first.NetIncome >= first.GrossIncome {
		t.Errorf("net income (%.2f) should be < gross (%.2f)", first.NetIncome, first.GrossIncome)
	}
}

func TestEngine_DebtPayoff(t *testing.T) {
	plan := basePlan()
	plan.IncomeStreams = []domain.IncomeStream{
		{
			ID:          uuid.New(),
			PlanID:      plan.ID,
			Type:        domain.IncomeTypeSalary,
			TaxCategory: domain.TaxCategoryW2,
			Amount:      10_000, // $120k/yr
			StartMonth:  0,
		},
	}
	// 5-year auto loan at 6%
	payment := simulation.StandardPayment(25_000, 0.06, 60)
	plan.DebtAccounts = []domain.DebtAccount{
		{
			ID:                uuid.New(),
			PlanID:            plan.ID,
			Name:              "Auto Loan",
			Type:              domain.DebtTypeAuto,
			OriginalPrincipal: 25_000,
			Balance:           25_000,
			InterestRate:      0.06,
			MinPayment:        payment,
			RepaymentPlan:     domain.RepaymentPlanStandard,
			StartMonth:        0,
		},
	}

	result := simulation.Run(plan, baseOpts())

	// By month 60, the loan should be paid off (balance = 0)
	snap60 := result.MonthlySnapshot[59]
	if snap60.TotalDebt > 1.0 { // allow for floating point
		t.Errorf("auto loan not paid off at month 60: balance = %.2f", snap60.TotalDebt)
	}
	// Month 1 should have debt payments
	if result.MonthlySnapshot[0].TotalDebtPayments < 400 {
		t.Errorf("expected substantial debt payment in month 1, got %.2f",
			result.MonthlySnapshot[0].TotalDebtPayments)
	}
}

func TestEngine_InvestmentGrowth(t *testing.T) {
	plan := basePlan()
	// Max out a Roth IRA
	plan.InvestmentAccounts = []domain.InvestmentAccount{
		{
			ID:              uuid.New(),
			PlanID:          plan.ID,
			Name:            "Roth IRA",
			Type:            domain.AccountTypeRothIRA,
			Balance:         10_000,
			MonthlyContrib:  583, // ~$7000/year
			AssetAllocation: stockAlloc(),
			StartMonth:      0,
		},
	}

	result := simulation.Run(plan, baseOpts())

	first := result.MonthlySnapshot[0]
	last := result.MonthlySnapshot[len(result.MonthlySnapshot)-1]

	// Investments should grow over 10 years
	if last.TotalInvestments <= first.TotalInvestments {
		t.Errorf("investments should grow: first=%.0f, last=%.0f",
			first.TotalInvestments, last.TotalInvestments)
	}
	// After 10 years with $10k start + $583/mo contributions at 7% → expect > $100k
	if last.TotalInvestments < 100_000 {
		t.Errorf("expected investment balance > $100k after 10 years, got %.0f",
			last.TotalInvestments)
	}
}

func TestEngine_LifeEventChangesIncome(t *testing.T) {
	plan := basePlan()
	streamID := uuid.New()
	plan.IncomeStreams = []domain.IncomeStream{
		{
			ID:          streamID,
			PlanID:      plan.ID,
			Type:        domain.IncomeTypeSalary,
			TaxCategory: domain.TaxCategoryW2,
			Amount:      6250, // $75k resident
			StartMonth:  0,
		},
	}

	// Life event at month 36: start attending ($25k/month = $300k/yr)
	plan.LifeEvents = []domain.LifeEvent{
		{
			ID:     uuid.New(),
			PlanID: plan.ID,
			Name:   "Start Attending",
			Type:   domain.EventTypeIncomeChange,
			Month:  36,
			Impacts: []domain.EventImpact{
				{
					ID:         uuid.New(),
					TargetType: "income_stream",
					TargetID:   streamID,
					Field:      "amount",
					NewValue:   25_000,
					Operation:  "set",
				},
			},
		},
	}

	result := simulation.Run(plan, baseOpts())

	pre := result.MonthlySnapshot[35].GrossIncome   // month before event
	post := result.MonthlySnapshot[36].GrossIncome  // month of event

	if post <= pre*2 {
		t.Errorf("income should jump significantly at attending transition: pre=%.0f, post=%.0f",
			pre, post)
	}
	t.Logf("Attending transition: pre=%.0f/mo, post=%.0f/mo", pre, post)
}

func TestEngine_CalendarMonths(t *testing.T) {
	plan := basePlan() // starts July 2026
	result := simulation.Run(plan, baseOpts())

	first := result.MonthlySnapshot[0]
	if first.Year != 2026 || first.CalendarMonth != 7 {
		t.Errorf("first snapshot: want 2026-07, got %d-%02d", first.Year, first.CalendarMonth)
	}

	// Month 6 (0-indexed) = January 2027
	m6 := result.MonthlySnapshot[6]
	if m6.Year != 2027 || m6.CalendarMonth != 1 {
		t.Errorf("month 6: want 2027-01, got %d-%02d", m6.Year, m6.CalendarMonth)
	}
}

func TestEngine_PSLF_Forgiveness(t *testing.T) {
	// Scenario: 84 qualifying PSLF payments already made.
	// 36 more months in plan = total 120 → forgiveness should occur at month 35.
	plan := basePlan()
	plan.SimulationConfig.HorizonYears = 5

	plan.IncomeStreams = []domain.IncomeStream{
		{
			ID:          uuid.New(),
			PlanID:      plan.ID,
			Type:        domain.IncomeTypeSalary,
			TaxCategory: domain.TaxCategoryW2,
			Amount:      7_000,
			StartMonth:  0,
		},
	}

	poverty := simulation.PovertyGuideline2026(2)
	idrPayment := simulation.IDRMonthlyPayment(84_000, poverty) // approx payment

	plan.DebtAccounts = []domain.DebtAccount{
		{
			ID:               uuid.New(),
			PlanID:           plan.ID,
			Type:             domain.DebtTypeStudentLoan,
			OriginalPrincipal: 200_000,
			Balance:          200_000,
			InterestRate:     0.065,
			MinPayment:       idrPayment,
			RepaymentPlan:    domain.RepaymentPlanIDR,
			PSLFEligible:     true,
			PSLFPaymentsMade: 84, // 84 already made; need 36 more
			StartMonth:       0,
		},
	}

	result := simulation.Run(plan, baseOpts())

	// By month 36, debt should be forgiven (balance = 0)
	if len(result.MonthlySnapshot) < 37 {
		t.Fatal("not enough snapshots")
	}

	snap36 := result.MonthlySnapshot[35]
	if snap36.TotalDebt > 1.0 {
		t.Errorf("PSLF forgiveness should occur by month 36, remaining debt=%.0f", snap36.TotalDebt)
	} else {
		t.Logf("PSLF forgiveness confirmed at/before month 36 (remaining balance=%.0f)", snap36.TotalDebt)
	}
}

func TestMonteCarlo_ProducesPercentiles(t *testing.T) {
	plan := basePlan()
	plan.SimulationConfig.MonteCarloPasses = 100 // small for test speed
	plan.InvestmentAccounts = []domain.InvestmentAccount{
		{
			ID:              uuid.New(),
			PlanID:          plan.ID,
			Type:            domain.AccountTypeTaxable,
			Balance:         50_000,
			MonthlyContrib:  1_000,
			AssetAllocation: stockAlloc(),
			StartMonth:      0,
		},
	}

	opts := baseOpts()
	opts.RunMonteCarlo = true

	result := simulation.Run(plan, opts)

	if result.MonteCarlo == nil {
		t.Fatal("expected Monte Carlo result, got nil")
	}
	if len(result.MonteCarlo.P50) != 10*12 {
		t.Errorf("expected 120 MC percentile points, got %d", len(result.MonteCarlo.P50))
	}

	// P90 should be strictly greater than P10 at most months
	last := len(result.MonteCarlo.P50) - 1
	if result.MonteCarlo.P90[last] <= result.MonteCarlo.P10[last] {
		t.Errorf("P90 (%.0f) should be > P10 (%.0f) at last month",
			result.MonteCarlo.P90[last], result.MonteCarlo.P10[last])
	}
	t.Logf("MC 10yr: P10=%.0f  P50=%.0f  P90=%.0f",
		result.MonteCarlo.P10[last], result.MonteCarlo.P50[last], result.MonteCarlo.P90[last])
}

// TestComparePlans verifies the comparison helper returns sensible deltas.
func TestComparePlans(t *testing.T) {
	planA := basePlan()
	planB := basePlan()

	// Plan B has double the income
	streamB := uuid.New()
	planB.IncomeStreams = []domain.IncomeStream{
		{
			ID:          streamB,
			PlanID:      planB.ID,
			Type:        domain.IncomeTypeSalary,
			TaxCategory: domain.TaxCategoryW2,
			Amount:      12_500, // $150k/yr
			StartMonth:  0,
		},
	}
	planB.InvestmentAccounts = []domain.InvestmentAccount{
		{
			ID:              uuid.New(),
			PlanID:          planB.ID,
			Type:            domain.AccountTypeTaxable,
			Balance:         0,
			MonthlyContrib:  1_000,
			AssetAllocation: stockAlloc(),
			StartMonth:      0,
		},
	}

	opts := baseOpts()
	resultA := simulation.Run(planA, opts)
	resultB := simulation.Run(planB, opts)
	resultA.PlanID = planA.ID
	resultB.PlanID = planB.ID

	comp := simulation.ComparePlans(resultA, resultB, []int{5, 10})
	if len(comp.Deltas) != 2 {
		t.Errorf("expected 2 horizon deltas, got %d", len(comp.Deltas))
	}
	// Plan B (higher income) should have higher net worth
	for _, d := range comp.Deltas {
		if d.Delta < 0 {
			t.Errorf("year %d: plan B should have higher net worth (delta=%.0f)", d.Year, d.Delta)
		}
		t.Logf("year %d: A=%.0f B=%.0f delta=%.0f", d.Year, d.PlanANetWorth, d.PlanBNetWorth, d.Delta)
	}
}

// Ensure time import is used
var _ = time.Now
