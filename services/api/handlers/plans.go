package handlers

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/solomon/domain"
	"github.com/solomon/infrastructure/postgres"
	mw "github.com/solomon/api/middleware"
)

type PlanHandler struct {
	repo *postgres.Repository
}

func NewPlanHandler(repo *postgres.Repository) *PlanHandler {
	return &PlanHandler{repo: repo}
}

// ListPlans returns all plans for the authenticated user's profile.
func (h *PlanHandler) ListPlans(c echo.Context) error {
	claims := mw.GetClaims(c)
	plans, err := h.repo.ListPlansByProfile(c.Request().Context(), claims.ProfileID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, plans)
}

type createPlanRequest struct {
	Name        string                `json:"name"`
	Description string                `json:"description"`
	Config      *domain.SimulationConfig `json:"simulation_config,omitempty"`
}

// CreatePlan creates a new root plan for the authenticated user.
func (h *PlanHandler) CreatePlan(c echo.Context) error {
	claims := mw.GetClaims(c)
	var req createPlanRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	planID := uuid.New()
	p := domain.Plan{
		ID:          planID,
		ProfileID:   claims.ProfileID,
		Name:        req.Name,
		Description: req.Description,
	}
	if req.Config != nil {
		req.Config.PlanID = planID
		p.SimulationConfig = *req.Config
	}

	created, err := h.repo.CreatePlan(c.Request().Context(), p)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

// GetPlan returns a fully-hydrated plan by ID.
func (h *PlanHandler) GetPlan(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}

	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}

	if !h.ownsplan(c, plan) {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	return c.JSON(http.StatusOK, plan)
}

type updatePlanRequest struct {
	Name             string                `json:"name"`
	Description      string                `json:"description"`
	SimulationConfig domain.SimulationConfig `json:"simulation_config"`
}

// UpdatePlan updates plan name, description, and simulation config.
func (h *PlanHandler) UpdatePlan(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}

	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}
	if !h.ownsplan(c, plan) {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	var req updatePlanRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	plan.Name = req.Name
	plan.Description = req.Description

	if err := h.repo.UpdatePlan(c.Request().Context(), plan); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if req.SimulationConfig.ID != uuid.Nil {
		if err := h.repo.UpdateSimulationConfig(c.Request().Context(), req.SimulationConfig); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}

	return c.JSON(http.StatusOK, plan)
}

// DeletePlan removes a plan and all its sub-entities.
func (h *PlanHandler) DeletePlan(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}

	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}
	if !h.ownsplan(c, plan) {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	if err := h.repo.DeletePlan(c.Request().Context(), id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

type forkRequest struct {
	ForkMonth   int    `json:"fork_month"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// ForkPlan creates a deep copy of a plan diverging at the specified month.
func (h *PlanHandler) ForkPlan(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}

	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}
	if !h.ownsplan(c, plan) {
		return echo.NewHTTPError(http.StatusForbidden, "access denied")
	}

	var req forkRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	fork, err := h.repo.ForkPlan(c.Request().Context(), id, req.ForkMonth, req.Name, req.Description, false)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, fork)
}

func (h *PlanHandler) ownsplan(c echo.Context, plan domain.Plan) bool {
	claims := mw.GetClaims(c)
	return plan.ProfileID == claims.ProfileID
}
