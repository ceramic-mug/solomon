package postgres

import (
	"encoding/json"

	"github.com/solomon/domain"
)

// ---- Plan ----

func planToDomain(m PlanModel) domain.Plan {
	p := domain.Plan{
		ID:           m.ID,
		ProfileID:    m.ProfileID,
		ParentPlanID: m.ParentPlanID,
		ForkMonth:    m.ForkMonth,
		Name:         m.Name,
		Description:  m.Description,
		CreatedByAI:  m.CreatedByAI,
		CreatedAt:    m.CreatedAt,
		UpdatedAt:    m.UpdatedAt,
		SimulationConfig: simConfigToDomain(m.SimulationConfig),
	}
	for _, s := range m.IncomeStreams {
		p.IncomeStreams = append(p.IncomeStreams, incomeStreamToDomain(s))
	}
	for _, e := range m.Expenses {
		p.Expenses = append(p.Expenses, expenseToDomain(e))
	}
	for _, d := range m.DebtAccounts {
		p.DebtAccounts = append(p.DebtAccounts, debtToDomain(d))
	}
	for _, inv := range m.InvestmentAccounts {
		p.InvestmentAccounts = append(p.InvestmentAccounts, investmentToDomain(inv))
	}
	for _, ev := range m.LifeEvents {
		p.LifeEvents = append(p.LifeEvents, lifeEventToDomain(ev))
	}
	for _, g := range m.GivingTargets {
		p.GivingTargets = append(p.GivingTargets, givingToDomain(g))
	}
	for _, ch := range m.Children {
		p.Children = append(p.Children, childToDomain(ch))
	}
	return p
}

func planToModel(p domain.Plan) PlanModel {
	return PlanModel{
		ID:           p.ID,
		ProfileID:    p.ProfileID,
		ParentPlanID: p.ParentPlanID,
		ForkMonth:    p.ForkMonth,
		Name:         p.Name,
		Description:  p.Description,
		CreatedByAI:  p.CreatedByAI,
	}
}

// ---- SimulationConfig ----

func simConfigToDomain(m SimulationConfigModel) domain.SimulationConfig {
	return domain.SimulationConfig{
		ID:               m.ID,
		PlanID:           m.PlanID,
		StartYear:        m.StartYear,
		StartMonth:       m.StartMonth,
		HorizonYears:     m.HorizonYears,
		InflationRate:    m.InflationRate,
		MonteCarloPasses: m.MonteCarloPasses,
		StockMeanReturn:  m.StockMeanReturn,
		StockStdDev:      m.StockStdDev,
		BondMeanReturn:   m.BondMeanReturn,
		BondStdDev:       m.BondStdDev,
		TargetCashFlow:         m.TargetCashFlow,
		ConstrainGiving:        m.ConstrainGiving,
		ConstrainSavings:       m.ConstrainSavings,
		ConstrainInvestments:   m.ConstrainInvestments,
		NetWorthCeilingEnabled: m.NetWorthCeilingEnabled,
		NetWorthCeiling:        m.NetWorthCeiling,
		FilingStatus:           m.FilingStatus,
		HouseholdSize:          m.HouseholdSize,
	}
}

func simConfigToModel(c domain.SimulationConfig) SimulationConfigModel {
	fs := c.FilingStatus
	if fs == "" {
		fs = "mfj"
	}
	hs := c.HouseholdSize
	if hs == 0 {
		hs = 2
	}
	return SimulationConfigModel{
		ID:                     c.ID,
		PlanID:                 c.PlanID,
		StartYear:              c.StartYear,
		StartMonth:             c.StartMonth,
		HorizonYears:           c.HorizonYears,
		InflationRate:          c.InflationRate,
		MonteCarloPasses:       c.MonteCarloPasses,
		StockMeanReturn:        c.StockMeanReturn,
		StockStdDev:            c.StockStdDev,
		BondMeanReturn:         c.BondMeanReturn,
		BondStdDev:             c.BondStdDev,
		TargetCashFlow:         c.TargetCashFlow,
		ConstrainGiving:        c.ConstrainGiving,
		ConstrainSavings:       c.ConstrainSavings,
		ConstrainInvestments:   c.ConstrainInvestments,
		NetWorthCeilingEnabled: c.NetWorthCeilingEnabled,
		NetWorthCeiling:        c.NetWorthCeiling,
		FilingStatus:           fs,
		HouseholdSize:          hs,
	}
}

// ---- Income ----

func incomeStreamToDomain(m IncomeStreamModel) domain.IncomeStream {
	return domain.IncomeStream{
		ID:          m.ID,
		PlanID:      m.PlanID,
		Name:        m.Name,
		Type:        domain.IncomeType(m.Type),
		TaxCategory: domain.TaxCategory(m.TaxCategory),
		Amount:      m.Amount,
		GrowthRate:  m.GrowthRate,
		StartMonth:  m.StartMonth,
		EndMonth:    m.EndMonth,
	}
}

func incomeStreamToModel(s domain.IncomeStream) IncomeStreamModel {
	return IncomeStreamModel{
		ID:          s.ID,
		PlanID:      s.PlanID,
		Name:        s.Name,
		Type:        string(s.Type),
		TaxCategory: string(s.TaxCategory),
		Amount:      s.Amount,
		GrowthRate:  s.GrowthRate,
		StartMonth:  s.StartMonth,
		EndMonth:    s.EndMonth,
	}
}

// ---- Expense ----

func expenseToDomain(m ExpenseModel) domain.Expense {
	return domain.Expense{
		ID:            m.ID,
		PlanID:        m.PlanID,
		Name:          m.Name,
		Category:      domain.ExpenseCategory(m.Category),
		MonthlyAmount: m.MonthlyAmount,
		GrowthRate:    m.GrowthRate,
		StartMonth:    m.StartMonth,
		EndMonth:      m.EndMonth,
		IsOneTime:     m.IsOneTime,
	}
}

func expenseToModel(e domain.Expense) ExpenseModel {
	return ExpenseModel{
		ID:            e.ID,
		PlanID:        e.PlanID,
		Name:          e.Name,
		Category:      string(e.Category),
		MonthlyAmount: e.MonthlyAmount,
		GrowthRate:    e.GrowthRate,
		StartMonth:    e.StartMonth,
		EndMonth:      e.EndMonth,
		IsOneTime:     e.IsOneTime,
	}
}

// ---- Debt ----

func debtToDomain(m DebtAccountModel) domain.DebtAccount {
	return domain.DebtAccount{
		ID:                m.ID,
		PlanID:            m.PlanID,
		Name:              m.Name,
		Type:              domain.DebtType(m.Type),
		OriginalPrincipal: m.OriginalPrincipal,
		Balance:           m.Balance,
		InterestRate:      m.InterestRate,
		MinPayment:        m.MinPayment,
		ExtraPayment:      m.ExtraPayment,
		StartMonth:        m.StartMonth,
		RepaymentPlan:     domain.RepaymentPlan(m.RepaymentPlan),
		PSLFEligible:      m.PSLFEligible,
		PSLFPaymentsMade:  m.PSLFPaymentsMade,
		PropertyValue:     m.PropertyValue,
		AppreciationRate:  m.AppreciationRate,
	}
}

func debtToModel(d domain.DebtAccount) DebtAccountModel {
	return DebtAccountModel{
		ID:                d.ID,
		PlanID:            d.PlanID,
		Name:              d.Name,
		Type:              string(d.Type),
		OriginalPrincipal: d.OriginalPrincipal,
		Balance:           d.Balance,
		InterestRate:      d.InterestRate,
		MinPayment:        d.MinPayment,
		ExtraPayment:      d.ExtraPayment,
		StartMonth:        d.StartMonth,
		RepaymentPlan:     string(d.RepaymentPlan),
		PSLFEligible:      d.PSLFEligible,
		PSLFPaymentsMade:  d.PSLFPaymentsMade,
		PropertyValue:     d.PropertyValue,
		AppreciationRate:  d.AppreciationRate,
	}
}

// ---- Investment ----

func investmentToDomain(m InvestmentAccountModel) domain.InvestmentAccount {
	var alloc domain.AssetAllocation
	_ = json.Unmarshal(m.AssetAllocation, &alloc)
	return domain.InvestmentAccount{
		ID:               m.ID,
		PlanID:           m.PlanID,
		Name:             m.Name,
		Type:             domain.AccountType(m.Type),
		Balance:          m.Balance,
		MonthlyContrib:   m.MonthlyContrib,
		ContribBasis:     domain.ContribBasis(m.ContribBasis),
		ContribPercent:   m.ContribPercent,
		OverflowPct:      m.OverflowPct,
		EmployerMatch:    m.EmployerMatch,
		EmployerMatchCap: m.EmployerMatchCap,
		AssetAllocation:  alloc,
		StartMonth:       m.StartMonth,
		GoalTarget:       m.GoalTarget,
		GoalLabel:        m.GoalLabel,
	}
}

func investmentToModel(inv domain.InvestmentAccount) InvestmentAccountModel {
	allocJSON, _ := json.Marshal(inv.AssetAllocation)
	return InvestmentAccountModel{
		ID:               inv.ID,
		PlanID:           inv.PlanID,
		Name:             inv.Name,
		Type:             string(inv.Type),
		Balance:          inv.Balance,
		MonthlyContrib:   inv.MonthlyContrib,
		ContribBasis:     string(inv.ContribBasis),
		ContribPercent:   inv.ContribPercent,
		OverflowPct:      inv.OverflowPct,
		EmployerMatch:    inv.EmployerMatch,
		EmployerMatchCap: inv.EmployerMatchCap,
		AssetAllocation:  allocJSON,
		StartMonth:       inv.StartMonth,
		GoalTarget:       inv.GoalTarget,
		GoalLabel:        inv.GoalLabel,
	}
}

// ---- Giving ----

func givingToDomain(m GivingTargetModel) domain.GivingTarget {
	return domain.GivingTarget{
		ID:          m.ID,
		PlanID:      m.PlanID,
		Name:        m.Name,
		Basis:       domain.GivingBasis(m.Basis),
		Percentage:  m.Percentage,
		OverflowPct: m.OverflowPct,
		FixedAmount: m.FixedAmount,
		StartMonth:  m.StartMonth,
		EndMonth:    m.EndMonth,
	}
}

func givingToModel(g domain.GivingTarget) GivingTargetModel {
	return GivingTargetModel{
		ID:          g.ID,
		PlanID:      g.PlanID,
		Name:        g.Name,
		Basis:       string(g.Basis),
		Percentage:  g.Percentage,
		OverflowPct: g.OverflowPct,
		FixedAmount: g.FixedAmount,
		StartMonth:  g.StartMonth,
		EndMonth:    g.EndMonth,
	}
}

// ---- Children ----

func childToDomain(m ChildModel) domain.Child {
	return domain.Child{
		ID:                m.ID,
		PlanID:            m.PlanID,
		Name:              m.Name,
		BirthMonth:        m.BirthMonth,
		SchoolPreference:  domain.ChildSchoolPref(m.SchoolPreference),
		CollegeAccountID:  m.CollegeAccountID,
		IncludeActivities: m.IncludeActivities,
		IncludeFirstCar:   m.IncludeFirstCar,
	}
}

func childToModel(c domain.Child) ChildModel {
	return ChildModel{
		ID:                c.ID,
		PlanID:            c.PlanID,
		Name:              c.Name,
		BirthMonth:        c.BirthMonth,
		SchoolPreference:  string(c.SchoolPreference),
		CollegeAccountID:  c.CollegeAccountID,
		IncludeActivities: c.IncludeActivities,
		IncludeFirstCar:   c.IncludeFirstCar,
	}
}

// ---- Life Events ----

func lifeEventToDomain(m LifeEventModel) domain.LifeEvent {
	ev := domain.LifeEvent{
		ID:     m.ID,
		PlanID: m.PlanID,
		Name:   m.Name,
		Type:   domain.EventType(m.Type),
		Month:  m.Month,
	}
	for _, imp := range m.Impacts {
		ev.Impacts = append(ev.Impacts, domain.EventImpact{
			ID:         imp.ID,
			EventID:    imp.EventID,
			TargetType: imp.TargetType,
			TargetID:   imp.TargetID,
			Field:      imp.Field,
			NewValue:   imp.NewValue,
			Operation:  imp.Operation,
		})
	}
	return ev
}

func lifeEventToModel(ev domain.LifeEvent) LifeEventModel {
	m := LifeEventModel{
		ID:     ev.ID,
		PlanID: ev.PlanID,
		Name:   ev.Name,
		Type:   string(ev.Type),
		Month:  ev.Month,
	}
	for _, imp := range ev.Impacts {
		m.Impacts = append(m.Impacts, EventImpactModel{
			ID:         imp.ID,
			EventID:    imp.EventID,
			TargetType: imp.TargetType,
			TargetID:   imp.TargetID,
			Field:      imp.Field,
			NewValue:   imp.NewValue,
			Operation:  imp.Operation,
		})
	}
	return m
}
