package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/solomon/domain"
	"github.com/solomon/infrastructure/postgres"
	mw "github.com/solomon/api/middleware"
	"github.com/solomon/simulation"
)

// SimulateHandler runs the simulation engine over a plan.
type SimulateHandler struct {
	repo *postgres.Repository
}

func NewSimulateHandler(repo *postgres.Repository) *SimulateHandler {
	return &SimulateHandler{repo: repo}
}

// Simulate runs a deterministic simulation for the given plan.
// Query params:
//   - filing_status: "single" | "mfj" | "mfs" | "hoh" (default: "mfj")
//   - household_size: integer (default: 2)
func (h *SimulateHandler) Simulate(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}

	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}

	claims := mw.GetClaims(c)
	if plan.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	opts := buildRunOptions(c, plan)
	result := simulation.Run(plan, opts)
	result.ID = uuid.New()
	result.PlanID = plan.ID
	result.GoalProgress = computeGoalProgress(plan.InvestmentAccounts, result.MonthlySnapshot)

	return c.JSON(http.StatusOK, result)
}

// SimulateMonteCarlo runs the simulation including Monte Carlo uncertainty bands.
func (h *SimulateHandler) SimulateMonteCarlo(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}

	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}

	claims := mw.GetClaims(c)
	if plan.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	opts := buildRunOptions(c, plan)
	opts.RunMonteCarlo = true

	result := simulation.Run(plan, opts)
	result.ID = uuid.New()
	result.PlanID = plan.ID
	result.GoalProgress = computeGoalProgress(plan.InvestmentAccounts, result.MonthlySnapshot)

	return c.JSON(http.StatusOK, result)
}

// ComparePlans returns a delta summary between two plans at standard horizons.
// Add ?include_snapshots=true to also receive both plans' full monthly snapshots.
func (h *SimulateHandler) ComparePlans(c echo.Context) error {
	idA, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}
	idB, err := uuid.Parse(c.Param("other_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid other_plan id")
	}

	claims := mw.GetClaims(c)

	planA, err := h.repo.GetPlan(c.Request().Context(), idA)
	if err != nil || planA.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusNotFound, "plan A not found")
	}
	planB, err := h.repo.GetPlan(c.Request().Context(), idB)
	if err != nil || planB.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusNotFound, "plan B not found")
	}

	opts := buildRunOptions(c, planA)
	resultA := simulation.Run(planA, opts)
	resultB := simulation.Run(planB, opts)
	resultA.PlanID = planA.ID
	resultB.PlanID = planB.ID

	horizons := []int{1, 3, 5, 10, 20, 30}
	full := domain.PlanComparisonFull{
		PlanAID: planA.ID,
		PlanBID: planB.ID,
	}
	for _, yr := range horizons {
		month := yr*12 - 1
		var a, b domain.MonthSnapshot
		if month < len(resultA.MonthlySnapshot) {
			a = resultA.MonthlySnapshot[month]
		}
		if month < len(resultB.MonthlySnapshot) {
			b = resultB.MonthlySnapshot[month]
		}
		full.FullDeltas = append(full.FullDeltas, domain.HorizonDeltaFull{
			Year:             yr,
			PlanANetWorth:    a.NetWorth,
			PlanBNetWorth:    b.NetWorth,
			PlanATotalDebt:   a.TotalDebt,
			PlanBTotalDebt:   b.TotalDebt,
			PlanAInvestments: a.TotalInvestments,
			PlanBInvestments: b.TotalInvestments,
			NetWorthDelta:    b.NetWorth - a.NetWorth,
		})
	}
	if c.QueryParam("include_snapshots") == "true" {
		full.PlanASnapshots = resultA.MonthlySnapshot
		full.PlanBSnapshots = resultB.MonthlySnapshot
	}

	return c.JSON(http.StatusOK, full)
}

// CompareRepayment runs the simulation four times (Standard/PAYE/SAVE/IBR_New)
// and returns a side-by-side summary of each strategy's outcomes.
func (h *SimulateHandler) CompareRepayment(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}
	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}
	claims := mw.GetClaims(c)
	if plan.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	opts := buildRunOptions(c, plan)

	strategies := []struct {
		name string
		plan domain.RepaymentPlan
	}{
		{"Standard (10yr)", domain.RepaymentPlanStandard},
		{"PAYE", domain.RepaymentPlanPAYE},
		{"SAVE", domain.RepaymentPlanSAVE},
		{"IBR (New)", domain.RepaymentPlanIBRNew},
	}

	// Identify the current strategy used by PSLF-eligible debts
	currentPlan := domain.RepaymentPlanStandard
	for _, d := range plan.DebtAccounts {
		if d.PSLFEligible {
			currentPlan = d.RepaymentPlan
			break
		}
	}

	var summaries []domain.RepaymentPlanSummary
	for _, strat := range strategies {
		// Clone debts and override PSLF-eligible loans
		modified := clonePlanWithRepayment(plan, strat.plan)
		result := simulation.Run(modified, opts)

		var totalInterest float64
		var debtFreeMonth int = -1
		var forgivenessAmount float64
		var forgivenessMonth int = -1

		for i, s := range result.MonthlySnapshot {
			totalInterest += s.TotalInterestPaid
			if debtFreeMonth == -1 && s.TotalDebt < 100 {
				debtFreeMonth = i
			}
		}

		// Detect PSLF forgiveness: first month where PSLF payments >= 120
		for i, s := range result.MonthlySnapshot {
			if s.PSLFQualifyingPayments >= 120 {
				forgivenessMonth = i
				if i > 0 {
					forgivenessAmount = result.MonthlySnapshot[i-1].TotalDebt
				}
				break
			}
		}

		var nw30 float64
		if len(result.MonthlySnapshot) > 0 {
			nw30 = result.MonthlySnapshot[len(result.MonthlySnapshot)-1].NetWorth
		}

		summaries = append(summaries, domain.RepaymentPlanSummary{
			PlanName:          strat.name,
			TotalInterestPaid: totalInterest,
			ForgivenessAmount: forgivenessAmount,
			ForgivenessMonth:  forgivenessMonth,
			NetWorth30yr:      nw30,
			DebtFreeMonth:     debtFreeMonth,
			CurrentStrategy:   strat.plan == currentPlan || (strat.plan == domain.RepaymentPlanPAYE && currentPlan == domain.RepaymentPlanIDR),
		})
	}

	return c.JSON(http.StatusOK, domain.RepaymentComparison{Plans: summaries})
}

// SimulateOverride runs a what-if simulation with temporary parameter overrides.
// Nothing is persisted — this is purely for sensitivity analysis.
func (h *SimulateHandler) SimulateOverride(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}
	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}
	claims := mw.GetClaims(c)
	if plan.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	var req domain.SimulateOverrideRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if req.ContributionMultiplier == 0 {
		req.ContributionMultiplier = 1.0
	}

	// Apply overrides to in-memory copy
	for i := range plan.DebtAccounts {
		plan.DebtAccounts[i].ExtraPayment += req.ExtraPaymentDelta
		if plan.DebtAccounts[i].ExtraPayment < 0 {
			plan.DebtAccounts[i].ExtraPayment = 0
		}
	}
	if req.UnforeseenExpenseMonthly > 0 {
		plan.Expenses = append(plan.Expenses, domain.Expense{
			ID:            uuid.New(),
			PlanID:        plan.ID,
			Name:          "Unforeseen Expenses (what-if)",
			Category:      domain.ExpenseCategoryOther,
			MonthlyAmount: req.UnforeseenExpenseMonthly,
			GrowthRate:    0,
			StartMonth:    0,
		})
	}
	if req.StockReturnOverride != nil {
		plan.SimulationConfig.StockMeanReturn = *req.StockReturnOverride
	}
	if req.IncomeGrowthOverride != nil {
		for i, s := range plan.IncomeStreams {
			if s.Type == domain.IncomeTypeSalary {
				plan.IncomeStreams[i].GrowthRate = *req.IncomeGrowthOverride
			}
		}
	}
	if req.ContributionMultiplier != 1.0 {
		for i := range plan.InvestmentAccounts {
			plan.InvestmentAccounts[i].MonthlyContrib *= req.ContributionMultiplier
		}
	}

	opts := buildRunOptions(c, plan)
	result := simulation.Run(plan, opts)
	result.ID = uuid.New()
	result.PlanID = plan.ID

	return c.JSON(http.StatusOK, result)
}

// SocialSecurity estimates the monthly Social Security benefit for a plan.
// Query params: current_age (int), retirement_age (int, default 67)
func (h *SimulateHandler) SocialSecurity(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}
	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}
	claims := mw.GetClaims(c)
	if plan.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	currentAge := 27
	if v := c.QueryParam("current_age"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			currentAge = n
		}
	}
	retirementAge := 67
	if v := c.QueryParam("retirement_age"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > currentAge {
			retirementAge = n
		}
	}

	estimate := simulation.EstimateSocialSecurity(plan, currentAge, retirementAge)
	return c.JSON(http.StatusOK, estimate)
}

// ExportPlan returns the full plan + latest simulation as a JSON export package.
func (h *SimulateHandler) ExportPlan(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}

	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}

	claims := mw.GetClaims(c)
	if plan.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	opts := buildRunOptions(c, plan)
	result := simulation.Run(plan, opts)
	result.ID = uuid.New()
	result.PlanID = plan.ID

	export := exportPackage{
		SchemaVersion: "1.0",
		Plan:          plan,
		Simulation:    result,
	}

	c.Response().Header().Set("Content-Disposition",
		`attachment; filename="solomon-plan-`+plan.ID.String()+`.json"`)
	c.Response().Header().Set("Content-Type", "application/json")

	enc := json.NewEncoder(c.Response())
	enc.SetIndent("", "  ")
	return enc.Encode(export)
}

type exportPackage struct {
	SchemaVersion string                  `json:"schema_version"`
	Plan          domain.Plan             `json:"plan"`
	Simulation    domain.SimulationResult `json:"simulation_result"`
}

// clonePlanWithRepayment returns a copy of the plan with all PSLF-eligible
// student loans switched to the given repayment plan (for strategy comparison).
func clonePlanWithRepayment(plan domain.Plan, rp domain.RepaymentPlan) domain.Plan {
	debts := make([]domain.DebtAccount, len(plan.DebtAccounts))
	copy(debts, plan.DebtAccounts)
	for i := range debts {
		if debts[i].PSLFEligible {
			debts[i].RepaymentPlan = rp
		}
	}
	plan.DebtAccounts = debts
	return plan
}

// computeGoalProgress scans simulation snapshots to determine when each savings-goal
// account first reaches its target balance.
func computeGoalProgress(accounts []domain.InvestmentAccount, snaps []domain.MonthSnapshot) []domain.GoalProgress {
	var out []domain.GoalProgress
	for _, acc := range accounts {
		if acc.GoalTarget <= 0 {
			continue
		}
		gp := domain.GoalProgress{
			AccountID:     acc.ID.String(),
			Name:          acc.Name,
			GoalLabel:     acc.GoalLabel,
			TargetBalance: acc.GoalTarget,
			ReachedMonth:  -1,
		}
		if len(snaps) > 0 {
			gp.CurrentBalance = snaps[0].InvestmentBalances[acc.ID.String()]
			gp.ProjectedBalance = snaps[len(snaps)-1].InvestmentBalances[acc.ID.String()]
		}
		for i, s := range snaps {
			if bal, ok := s.InvestmentBalances[acc.ID.String()]; ok && bal >= acc.GoalTarget {
				gp.ReachedMonth = i
				break
			}
		}
		out = append(out, gp)
	}
	return out
}

// buildRunOptions extracts simulation run options from query parameters,
// falling back to plan's stored filing_status and household_size.
func buildRunOptions(c echo.Context, plan domain.Plan) simulation.RunOptions {
	filing := simulation.FilingStatus(c.QueryParam("filing_status"))
	if filing == "" {
		if plan.SimulationConfig.FilingStatus != "" {
			filing = simulation.FilingStatus(plan.SimulationConfig.FilingStatus)
		} else {
			filing = simulation.FilingStatusMarriedFilingJointly
		}
	}

	householdSize := plan.SimulationConfig.HouseholdSize
	if householdSize <= 0 {
		householdSize = 2
	}
	if hs := c.QueryParam("household_size"); hs != "" {
		if n, err := strconv.Atoi(hs); err == nil && n > 0 {
			householdSize = n
		}
	}

	// Get state tax from the profile (stored in plan context via claims lookup — not stored on plan directly).
	// For now default to 0; the UI will pass it as a query param or we fetch from profile.
	stateTax := 0.0
	if st := c.QueryParam("state_tax"); st != "" {
		if f, err := strconv.ParseFloat(st, 64); err == nil {
			stateTax = f
		}
	}

	return simulation.RunOptions{
		FilingStatus:  filing,
		HouseholdSize: householdSize,
		StateTaxRate:  stateTax,
	}
}
