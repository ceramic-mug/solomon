package simulation

import (
	"math"

	"github.com/solomon/domain"
)

// 2026 SSA AIME → PIA bend points (monthly dollar amounts).
const (
	ssaBendPoint1 = 1226.0 // 90% applies up to this amount
	ssaBendPoint2 = 7391.0 // 32% applies from bend1 to bend2; 15% above
)

// EstimateSocialSecurity estimates the monthly Social Security PIA benefit
// from a plan's income streams, the user's current age, and target retirement age.
//
// Uses a simplified AIME: average monthly W-2/salary income over the projected
// career (plan start → retirement). The real SSA formula uses the 35 highest
// wage-indexed years; this approximation is accurate for full-career earners.
func EstimateSocialSecurity(plan domain.Plan, currentAge, retirementAge int) domain.SocialSecurityEstimate {
	if retirementAge <= currentAge {
		return domain.SocialSecurityEstimate{}
	}

	cfg := plan.SimulationConfig
	retirementMonth := (retirementAge - currentAge) * 12

	// Cap to simulation horizon
	totalMonths := retirementMonth
	if totalMonths > cfg.HorizonYears*12 {
		totalMonths = cfg.HorizonYears * 12
	}
	if totalMonths <= 0 {
		return domain.SocialSecurityEstimate{RetirementMonth: retirementMonth}
	}

	// Sum monthly W-2/salary income across all months up to retirement.
	var totalMonthlyIncome float64
	activeSalaryMonths := 0

	for m := 0; m < totalMonths; m++ {
		var monthIncome float64
		for _, s := range plan.IncomeStreams {
			// Count W-2 wages and salary-type income toward SS earnings
			if s.Type != domain.IncomeTypeSalary &&
				s.TaxCategory != domain.TaxCategoryW2 {
				continue
			}
			if !s.IsActiveAtMonth(m) {
				continue
			}
			years := float64(m-s.StartMonth) / 12.0
			if years < 0 {
				years = 0
			}
			amt := s.Amount * math.Pow(1+s.GrowthRate, years)
			monthIncome += amt
		}
		if monthIncome > 0 {
			totalMonthlyIncome += monthIncome
			activeSalaryMonths++
		}
	}

	if activeSalaryMonths == 0 {
		return domain.SocialSecurityEstimate{RetirementMonth: retirementMonth}
	}

	aime := totalMonthlyIncome / float64(activeSalaryMonths)
	pia := calcPIA(aime)

	return domain.SocialSecurityEstimate{
		MonthlyBenefit:  pia,
		RetirementMonth: retirementMonth,
		AIME:            aime,
	}
}

// calcPIA applies the 2026 SSA Primary Insurance Amount formula to a given AIME.
func calcPIA(aime float64) float64 {
	if aime <= 0 {
		return 0
	}
	var pia float64
	if aime <= ssaBendPoint1 {
		return aime * 0.90
	}
	pia += ssaBendPoint1 * 0.90

	if aime <= ssaBendPoint2 {
		pia += (aime - ssaBendPoint1) * 0.32
		return pia
	}
	pia += (ssaBendPoint2 - ssaBendPoint1) * 0.32
	pia += (aime - ssaBendPoint2) * 0.15
	return pia
}
