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

	return c.JSON(http.StatusOK, result)
}

// ComparePlans returns a delta summary between two plans at standard horizons.
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

	comparison := simulation.ComparePlans(resultA, resultB, []int{1, 3, 5, 10, 15, 20, 30})

	return c.JSON(http.StatusOK, comparison)
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

// buildRunOptions extracts simulation run options from query parameters.
func buildRunOptions(c echo.Context, plan domain.Plan) simulation.RunOptions {
	filing := simulation.FilingStatus(c.QueryParam("filing_status"))
	if filing == "" {
		filing = simulation.FilingStatusMarriedFilingJointly
	}

	householdSize := 2
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
