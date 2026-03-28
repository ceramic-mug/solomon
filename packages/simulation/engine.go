package simulation

import (
	"math"
	"sort"

	"github.com/solomon/domain"
)

// RunOptions controls optional simulation behaviors.
type RunOptions struct {
	RunMonteCarlo    bool
	FilingStatus     FilingStatus
	HouseholdSize    int // for IDR poverty guideline lookup
	StateTaxRate     float64
}

// Run executes a full deterministic simulation for the given plan.
// It returns a complete SimulationResult with one MonthSnapshot per simulated month.
func Run(plan domain.Plan, opts RunOptions) domain.SimulationResult {
	cfg := plan.SimulationConfig
	totalMonths := cfg.HorizonYears * 12

	// Sort life events by month so we can apply them in order
	events := make([]domain.LifeEvent, len(plan.LifeEvents))
	copy(events, plan.LifeEvents)
	sort.Slice(events, func(i, j int) bool { return events[i].Month < events[j].Month })

	// Working copies of mutable state
	incomes := cloneIncomes(plan.IncomeStreams)
	expenses := cloneExpenses(plan.Expenses)
	debts := cloneDebts(plan.DebtAccounts)
	investments := cloneInvestments(plan.InvestmentAccounts)

	// PSLF state per debt account (keyed by index)
	pslfStates := make([]PSLFState, len(debts))
	for i, d := range debts {
		pslfStates[i] = PSLFState{
			QualifyingPayments: d.PSLFPaymentsMade,
			ForgivenAt:         -1,
		}
	}

	// IRS annual contribution tracking — reset each January
	yearlyContribs := make(map[domain.AccountType]float64)

	snapshots := make([]domain.MonthSnapshot, 0, totalMonths)

	// Monte Carlo inputs (populated during deterministic pass)
	mcInputs := make([]MCMonthInput, 0, totalMonths)
	baseNetDebt := make([]float64, 0, totalMonths)

	for m := 0; m < totalMonths; m++ {
		calYear, calMonth := monthToCalendar(cfg.StartYear, cfg.StartMonth, m)

		// Reset annual IRS contribution counters on January
		if calMonth == 1 {
			yearlyContribs = make(map[domain.AccountType]float64)
		}

		// Apply any life events firing this month
		for _, ev := range events {
			if ev.Month == m {
				applyLifeEvent(ev, incomes, expenses, debts, investments)
			}
		}

		// ---- Income ----
		var grossIncome float64
		var preTaxDeductions float64 // 401k, HSA, pre-tax benefits

		for _, s := range incomes {
			if s.IsActiveAtMonth(m) {
				years := float64(m-s.StartMonth) / 12.0
				amt := s.Amount * math.Pow(1+s.GrowthRate, years)
				grossIncome += amt
			}
		}

		// ---- Pre-tax investment contributions (reduce AGI) ----
		for _, inv := range investments {
			if m < inv.StartMonth {
				continue
			}
			switch inv.Type {
			case domain.AccountTypeTrad401k, domain.AccountTypeRoth401k, domain.AccountTypeTrad457b:
				preTaxDeductions += inv.MonthlyContrib
			case domain.AccountTypeHSA:
				preTaxDeductions += inv.MonthlyContrib
			}
		}

		// ---- Tax calculation ----
		annualGross := grossIncome * 12
		annualPreTax := preTaxDeductions * 12
		taxOut := CalculateTax(TaxInput{
			AnnualGross:      annualGross,
			PreTaxDeductions: annualPreTax,
			FilingStatus:     opts.FilingStatus,
			StateTaxRate:     opts.StateTaxRate,
		})
		monthlyTax := taxOut.TotalMonthly
		netIncome := grossIncome - monthlyTax

		// ---- AGI for IDR calculation ----
		agi := (annualGross - annualPreTax) / 12 * 12 // annual AGI

		// ---- Giving ----
		var totalGiving float64
		givingItems := make([]float64, len(plan.GivingTargets))
		for i, g := range plan.GivingTargets {
			if m < g.StartMonth {
				continue
			}
			if g.EndMonth != nil && m > *g.EndMonth {
				continue
			}
			if g.FixedAmount != nil {
				givingItems[i] = *g.FixedAmount
			} else {
				base := grossIncome
				if g.Basis == domain.GivingBasisNet {
					base = netIncome
				}
				givingItems[i] = base * g.Percentage
			}
			totalGiving += givingItems[i]
		}

		// ---- Expenses ----
		var totalExpenses float64
		for _, e := range expenses {
			totalExpenses += e.AmountAtMonth(m)
		}

		// ---- Debt payments ----
		var totalDebtPayments float64
		// ... (debt logic unchanged, keeping it for context)
		var totalInterestPaid float64
		var totalDebt float64
		totalPSLFQualifying := 0

		for i, d := range debts {
			if m < d.StartMonth || d.Balance <= 0 {
				continue
			}

			var payment float64
			poverty := PovertyGuideline2026(opts.HouseholdSize)
			switch d.RepaymentPlan {
			case domain.RepaymentPlanIDR, domain.RepaymentPlanPAYE:
				stdCap := d.StandardPayment(d.OriginalPrincipal, 120)
				payment = PAYEMonthlyPayment(agi, poverty, stdCap) + d.ExtraPayment
			case domain.RepaymentPlanSAVE:
				payment = SAVEMonthlyPayment(agi, poverty) + d.ExtraPayment
			case domain.RepaymentPlanIBRNew:
				payment = IBRNewMonthlyPayment(agi, poverty) + d.ExtraPayment
			default:
				payment = d.MinPayment + d.ExtraPayment
			}

			step := ProcessDebtMonth(d.Balance, d.InterestRate, payment)
			debts[i].Balance = step.NewBalance
			totalDebtPayments += step.TotalPaid
			totalInterestPaid += step.InterestCharge

			if d.PSLFEligible &&
				(d.RepaymentPlan == domain.RepaymentPlanIDR ||
					d.RepaymentPlan == domain.RepaymentPlanPAYE ||
					d.RepaymentPlan == domain.RepaymentPlanSAVE ||
					d.RepaymentPlan == domain.RepaymentPlanIBRNew) {
				pslfStates[i] = ProcessPSLFMonth(pslfStates[i], step.TotalPaid, debts[i].Balance, true, m)
				totalPSLFQualifying = pslfStates[i].QualifyingPayments
				if pslfStates[i].ForgivenAt == m {
					debts[i].Balance = 0
				}
			}
		}

		// Sum remaining debt + capture per-debt balances
		debtBals := make(map[string]float64, len(debts))
		for _, d := range debts {
			totalDebt += d.Balance
			debtBals[d.ID.String()] = d.Balance
		}

		// Home equity: for mortgage debts, compute appreciated property value minus remaining balance.
		// If PropertyValue is not set, fall back to OriginalPrincipal (purchase price ≈ loan amount).
		var totalHomeEquity float64
		for _, d := range debts {
			if d.Type == domain.DebtTypeMortgage {
				propValue := d.PropertyValue
				if propValue <= 0 {
					propValue = d.OriginalPrincipal
				}
				appreciationRate := d.AppreciationRate
				if appreciationRate <= 0 {
					appreciationRate = 0.03 // default 3% annual appreciation
				}
				years := float64(m) / 12.0
				appreciated := propValue * math.Pow(1+appreciationRate, years)
				if equity := appreciated - d.Balance; equity > 0 {
					totalHomeEquity += equity
				}
			}
		}

		// ---- Investment & Savings contributions (pre-calculation) ----
		type invContrib struct {
			index   int
			amount  float64
			isSavings bool
		}
		desiredInvestContribs := make([]invContrib, 0, len(investments))
		var totalDesiredInvest float64

		for i, inv := range investments {
			if m < inv.StartMonth {
				continue
			}
			contrib := inv.MonthlyContrib
			// Enforce IRS annual limits (employee contributions only)
			limit, hasLimit := domain.IRSLimits2026[inv.Type]
			if hasLimit {
				annualSoFar := yearlyContribs[inv.Type]
				headroom := limit - annualSoFar
				if headroom <= 0 {
					contrib = 0
				} else if inv.MonthlyContrib > headroom {
					contrib = headroom
				}
			}

			isSavings := inv.Type == domain.AccountTypeSavings || inv.Type == domain.AccountTypeMoneyMarket || inv.Type == domain.AccountTypeCash
			desiredInvestContribs = append(desiredInvestContribs, invContrib{index: i, amount: contrib, isSavings: isSavings})
			totalDesiredInvest += contrib
		}

		// ---- Cash Flow Constrainer Logic ----
		// Calculate cash flow BEFORE giving and investment
		baseCashFlow := netIncome - totalExpenses - totalDebtPayments
		targetCF := cfg.TargetCashFlow
		
		// If baseCashFlow is already below target, we definitely need to cut.
		// If not, we check if applying giving and investment pushes us below target.
		
		availableForOutflows := baseCashFlow - targetCF
		if availableForOutflows < 0 {
			availableForOutflows = 0
		}

		// Priority 1: Investment (cut first if cfg.ConstrainInvestments)
		// Priority 2: Giving (cut second if cfg.ConstrainGiving)
		// Priority 3: Savings (cut third if cfg.ConstrainSavings)
		
		actualInvestContribs := make([]float64, len(investments))
		actualGiving := make([]float64, len(plan.GivingTargets))
		
		// Temporary variables for iterative cutting
		remainingAvailable := availableForOutflows

		// 1. Handle non-savings investments
		var totalDesiredNonSavings float64
		for _, dc := range desiredInvestContribs {
			if !dc.isSavings {
				totalDesiredNonSavings += dc.amount
			}
		}

		if cfg.ConstrainInvestments && totalDesiredNonSavings > remainingAvailable {
			ratio := 0.0
			if totalDesiredNonSavings > 0 {
				ratio = remainingAvailable / totalDesiredNonSavings
			}
			for _, dc := range desiredInvestContribs {
				if !dc.isSavings {
					actualInvestContribs[dc.index] = dc.amount * ratio
				}
			}
			remainingAvailable = 0
		} else {
			for _, dc := range desiredInvestContribs {
				if !dc.isSavings {
					actualInvestContribs[dc.index] = dc.amount
					remainingAvailable -= dc.amount
				}
			}
		}
		if remainingAvailable < 0 { remainingAvailable = 0 }

		// 2. Handle Giving
		if cfg.ConstrainGiving && totalGiving > remainingAvailable {
			ratio := 0.0
			if totalGiving > 0 {
				ratio = remainingAvailable / totalGiving
			}
			for i := range actualGiving {
				actualGiving[i] = givingItems[i] * ratio
			}
			remainingAvailable = 0
		} else {
			for i := range actualGiving {
				actualGiving[i] = givingItems[i]
				remainingAvailable -= givingItems[i]
			}
		}
		if remainingAvailable < 0 { remainingAvailable = 0 }

		// 3. Handle Savings
		var totalDesiredSavings float64
		for _, dc := range desiredInvestContribs {
			if dc.isSavings {
				totalDesiredSavings += dc.amount
			}
		}

		if cfg.ConstrainSavings && totalDesiredSavings > remainingAvailable {
			ratio := 0.0
			if totalDesiredSavings > 0 {
				ratio = remainingAvailable / totalDesiredSavings
			}
			for _, dc := range desiredInvestContribs {
				if dc.isSavings {
					actualInvestContribs[dc.index] = dc.amount * ratio
				}
			}
			remainingAvailable = 0
		} else {
			for _, dc := range desiredInvestContribs {
				if dc.isSavings {
					actualInvestContribs[dc.index] = dc.amount
					remainingAvailable -= dc.amount
				}
			}
		}

		// Final totals
		var totalInvestContrib float64
		for _, amt := range actualInvestContribs {
			totalInvestContrib += amt
		}
		totalGiving = 0
		for _, amt := range actualGiving {
			totalGiving += amt
		}

		// ---- Apply investment compounding and actual contributions ----
		var totalInvestments float64
		totalStockPct := 0.0
		totalBondPct := 0.0
		totalCashPct := 0.0
		totalBalance := 0.0

		for i, inv := range investments {
			if m < inv.StartMonth {
				continue
			}

			contrib := actualInvestContribs[i]

			// Employer match (unconstrained by cash flow cap as it's from employer)
			if (inv.Type == domain.AccountTypeTrad401k || inv.Type == domain.AccountTypeRoth401k) &&
				inv.EmployerMatch > 0 && inv.EmployerMatchCap > 0 {
				monthlyGross := grossIncome
				matchCap := monthlyGross * inv.EmployerMatchCap
				match := monthlyGross * inv.EmployerMatch
				if match > matchCap {
					match = matchCap
				}
				contrib += match
			}

			// Update annual contribution tracker (only for the part user actually contributed)
			if _, hasLimit := domain.IRSLimits2026[inv.Type]; hasLimit {
				yearlyContribs[inv.Type] += actualInvestContribs[i]
			}

			stockRet := MonthlyReturn(cfg.StockMeanReturn)
			bondRet := MonthlyReturn(cfg.BondMeanReturn)
			cashRet := MonthlyReturn(0.05)

			investments[i].Balance = CompoundMonth(
				inv.Balance,
				stockRet, bondRet, cashRet,
				inv.AssetAllocation.StockPct,
				inv.AssetAllocation.BondPct,
				inv.AssetAllocation.CashPct,
				contrib,
			)

			totalInvestments += investments[i].Balance
			totalBalance += investments[i].Balance
			totalStockPct += inv.AssetAllocation.StockPct * investments[i].Balance
			totalBondPct += inv.AssetAllocation.BondPct * investments[i].Balance
			totalCashPct += inv.AssetAllocation.CashPct * investments[i].Balance
		}

		// Weighted average allocation across all accounts (for MC)
		if totalBalance > 0 {
			totalStockPct /= totalBalance
			totalBondPct /= totalBalance
			totalCashPct /= totalBalance
		}

		// Per-investment balance snapshot
		invBals := make(map[string]float64, len(investments))
		for _, inv := range investments {
			invBals[inv.ID.String()] = inv.Balance
		}

		cashFlow := netIncome - totalExpenses - totalDebtPayments - totalGiving - totalInvestContrib
		netWorth := totalInvestments - totalDebt + totalHomeEquity

		snap := domain.MonthSnapshot{
			Month:              m,
			Year:               calYear,
			CalendarMonth:      calMonth,
			GrossIncome:        grossIncome,
			TaxesPaid:          monthlyTax,
			NetIncome:          netIncome,
			TotalExpenses:      totalExpenses,
			TotalDebtPayments:  totalDebtPayments,
			TotalInterestPaid:  totalInterestPaid,
			TotalGiving:        totalGiving,
			TotalInvestContrib: totalInvestContrib,
			CashFlow:           cashFlow,
			TotalDebt:          totalDebt,
			TotalInvestments:   totalInvestments,
			NetWorth:           netWorth,
			DebtBalances:       debtBals,
			InvestmentBalances: invBals,
		}
		if totalPSLFQualifying > 0 {
			snap.PSLFQualifyingPayments = totalPSLFQualifying
		}
		if totalHomeEquity > 0 {
			snap.HomeEquity = totalHomeEquity
		}

		snapshots = append(snapshots, snap)

		// Collect MC inputs
		mcInputs = append(mcInputs, MCMonthInput{
			Contribution:    totalInvestContrib,
			StockPct:        totalStockPct,
			BondPct:         totalBondPct,
			CashPct:         totalCashPct,
			StartingBalance: totalInvestments - totalInvestContrib,
		})
		baseNetDebt = append(baseNetDebt, totalDebt)
	}

	result := domain.SimulationResult{
		PlanID:          plan.ID,
		MonthlySnapshot: snapshots,
	}

	if opts.RunMonteCarlo && cfg.MonteCarloPasses > 0 {
		mc := RunMonteCarlo(MCConfig{
			Passes:          cfg.MonteCarloPasses,
			StockMeanAnnual: cfg.StockMeanReturn,
			StockStdAnnual:  cfg.StockStdDev,
			BondMeanAnnual:  cfg.BondMeanReturn,
			BondStdAnnual:   cfg.BondStdDev,
			CashMeanAnnual:  0.05,
		}, mcInputs, baseNetDebt)

		result.MonteCarlo = &domain.MonteCarloResult{
			Passes: mc.Passes,
			P10:    mc.P10,
			P25:    mc.P25,
			P50:    mc.P50,
			P75:    mc.P75,
			P90:    mc.P90,
		}
	}

	return result
}

// ComparePlans returns a PlanComparison showing net worth deltas at standard horizons.
func ComparePlans(a, b domain.SimulationResult, horizonYears []int) domain.PlanComparison {
	comp := domain.PlanComparison{
		PlanAID: a.PlanID,
		PlanBID: b.PlanID,
	}
	for _, yr := range horizonYears {
		month := yr*12 - 1
		var aNW, bNW float64
		if month < len(a.MonthlySnapshot) {
			aNW = a.MonthlySnapshot[month].NetWorth
		}
		if month < len(b.MonthlySnapshot) {
			bNW = b.MonthlySnapshot[month].NetWorth
		}
		comp.Deltas = append(comp.Deltas, domain.HorizonDelta{
			Year:          yr,
			PlanANetWorth: aNW,
			PlanBNetWorth: bNW,
			Delta:         bNW - aNW,
		})
	}
	return comp
}

// ---- helpers ----

func monthToCalendar(startYear, startMonth, offset int) (year, month int) {
	totalMonth := startMonth - 1 + offset // 0-indexed
	year = startYear + totalMonth/12
	month = totalMonth%12 + 1
	return
}

func cloneIncomes(src []domain.IncomeStream) []domain.IncomeStream {
	out := make([]domain.IncomeStream, len(src))
	copy(out, src)
	return out
}

func cloneExpenses(src []domain.Expense) []domain.Expense {
	out := make([]domain.Expense, len(src))
	copy(out, src)
	return out
}

func cloneDebts(src []domain.DebtAccount) []domain.DebtAccount {
	out := make([]domain.DebtAccount, len(src))
	copy(out, src)
	return out
}

func cloneInvestments(src []domain.InvestmentAccount) []domain.InvestmentAccount {
	out := make([]domain.InvestmentAccount, len(src))
	copy(out, src)
	return out
}

// applyLifeEvent mutates the working copies of plan components per EventImpact rules.
func applyLifeEvent(ev domain.LifeEvent,
	incomes []domain.IncomeStream,
	expenses []domain.Expense,
	debts []domain.DebtAccount,
	investments []domain.InvestmentAccount,
) {
	for _, imp := range ev.Impacts {
		switch imp.TargetType {
		case "income_stream":
			for i, s := range incomes {
				if s.ID == imp.TargetID {
					incomes[i] = applyImpactToIncome(s, imp)
				}
			}
		case "expense":
			for i, e := range expenses {
				if e.ID == imp.TargetID {
					expenses[i] = applyImpactToExpense(e, imp)
				}
			}
		case "debt":
			for i, d := range debts {
				if d.ID == imp.TargetID {
					debts[i] = applyImpactToDebt(d, imp)
				}
			}
		case "investment":
			for i, inv := range investments {
				if inv.ID == imp.TargetID {
					investments[i] = applyImpactToInvestment(inv, imp)
				}
			}
		}
	}
}

func applyImpact(current float64, imp domain.EventImpact) float64 {
	switch imp.Operation {
	case "set":
		return imp.NewValue
	case "add":
		return current + imp.NewValue
	case "multiply":
		return current * imp.NewValue
	default:
		return imp.NewValue
	}
}

func applyImpactToIncome(s domain.IncomeStream, imp domain.EventImpact) domain.IncomeStream {
	switch imp.Field {
	case "amount":
		s.Amount = applyImpact(s.Amount, imp)
	case "growth_rate":
		s.GrowthRate = applyImpact(s.GrowthRate, imp)
	}
	return s
}

func applyImpactToExpense(e domain.Expense, imp domain.EventImpact) domain.Expense {
	switch imp.Field {
	case "monthly_amount":
		e.MonthlyAmount = applyImpact(e.MonthlyAmount, imp)
	}
	return e
}

func applyImpactToDebt(d domain.DebtAccount, imp domain.EventImpact) domain.DebtAccount {
	switch imp.Field {
	case "extra_payment":
		d.ExtraPayment = applyImpact(d.ExtraPayment, imp)
	case "min_payment":
		d.MinPayment = applyImpact(d.MinPayment, imp)
	case "balance":
		d.Balance = applyImpact(d.Balance, imp)
	}
	return d
}

func applyImpactToInvestment(inv domain.InvestmentAccount, imp domain.EventImpact) domain.InvestmentAccount {
	switch imp.Field {
	case "monthly_contrib":
		inv.MonthlyContrib = applyImpact(inv.MonthlyContrib, imp)
	case "balance":
		inv.Balance = applyImpact(inv.Balance, imp)
	}
	return inv
}

// ensure math import used
var _ = math.Pow
