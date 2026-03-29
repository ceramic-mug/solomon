// Package handlers contains all HTTP handlers for the Solomon API.
// This file handles CRUD for plan sub-entities: income, expenses, debts, investments, events, giving.
package handlers

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/solomon/domain"
	"github.com/solomon/infrastructure/postgres"
	mw "github.com/solomon/api/middleware"
)

// ComponentHandler handles CRUD for all plan sub-entities.
type ComponentHandler struct {
	repo *postgres.Repository
}

func NewComponentHandler(repo *postgres.Repository) *ComponentHandler {
	return &ComponentHandler{repo: repo}
}

// planID extracts and validates the :id param, then verifies ownership.
func (h *ComponentHandler) planID(c echo.Context) (uuid.UUID, domain.Plan, error) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return uuid.Nil, domain.Plan{}, echo.NewHTTPError(http.StatusBadRequest, "invalid plan id")
	}
	plan, err := h.repo.GetPlan(c.Request().Context(), id)
	if err != nil {
		return uuid.Nil, domain.Plan{}, echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}
	claims := mw.GetClaims(c)
	if plan.ProfileID != claims.ProfileID {
		return uuid.Nil, domain.Plan{}, echo.NewHTTPError(http.StatusForbidden, "access denied")
	}
	return id, plan, nil
}

// ---- Income Streams ----

func (h *ComponentHandler) CreateIncome(c echo.Context) error {
	planID, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var s domain.IncomeStream
	if err := c.Bind(&s); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	s.ID = uuid.New()
	s.PlanID = planID
	created, err := h.repo.CreateIncomeStream(c.Request().Context(), s)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

func (h *ComponentHandler) UpdateIncome(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var s domain.IncomeStream
	if err := c.Bind(&s); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.repo.UpdateIncomeStream(c.Request().Context(), s); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, s)
}

func (h *ComponentHandler) DeleteIncome(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	subID, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid income stream id")
	}
	if err := h.repo.DeleteIncomeStream(c.Request().Context(), subID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// ---- Expenses ----

func (h *ComponentHandler) CreateExpense(c echo.Context) error {
	planID, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var e domain.Expense
	if err := c.Bind(&e); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	e.ID = uuid.New()
	e.PlanID = planID
	created, err := h.repo.CreateExpense(c.Request().Context(), e)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

func (h *ComponentHandler) UpdateExpense(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var e domain.Expense
	if err := c.Bind(&e); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.repo.UpdateExpense(c.Request().Context(), e); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, e)
}

func (h *ComponentHandler) DeleteExpense(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	subID, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid expense id")
	}
	if err := h.repo.DeleteExpense(c.Request().Context(), subID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// ---- Debts ----

func (h *ComponentHandler) CreateDebt(c echo.Context) error {
	planID, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var d domain.DebtAccount
	if err := c.Bind(&d); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	d.ID = uuid.New()
	d.PlanID = planID
	d.OriginalPrincipal = d.Balance
	created, err := h.repo.CreateDebt(c.Request().Context(), d)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

func (h *ComponentHandler) UpdateDebt(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var d domain.DebtAccount
	if err := c.Bind(&d); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	d.OriginalPrincipal = d.Balance
	if err := h.repo.UpdateDebt(c.Request().Context(), d); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, d)
}

func (h *ComponentHandler) DeleteDebt(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	subID, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid debt id")
	}
	if err := h.repo.DeleteDebt(c.Request().Context(), subID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// ---- Investments ----

func (h *ComponentHandler) CreateInvestment(c echo.Context) error {
	planID, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var inv domain.InvestmentAccount
	if err := c.Bind(&inv); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	inv.ID = uuid.New()
	inv.PlanID = planID
	created, err := h.repo.CreateInvestment(c.Request().Context(), inv)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

func (h *ComponentHandler) UpdateInvestment(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var inv domain.InvestmentAccount
	if err := c.Bind(&inv); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.repo.UpdateInvestment(c.Request().Context(), inv); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, inv)
}

func (h *ComponentHandler) DeleteInvestment(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	subID, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid investment id")
	}
	if err := h.repo.DeleteInvestment(c.Request().Context(), subID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// ---- Life Events ----

func (h *ComponentHandler) CreateEvent(c echo.Context) error {
	planID, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var ev domain.LifeEvent
	if err := c.Bind(&ev); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	ev.ID = uuid.New()
	ev.PlanID = planID
	created, err := h.repo.CreateLifeEvent(c.Request().Context(), ev)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

func (h *ComponentHandler) UpdateEvent(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var ev domain.LifeEvent
	if err := c.Bind(&ev); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.repo.UpdateLifeEvent(c.Request().Context(), ev); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, ev)
}

func (h *ComponentHandler) DeleteEvent(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	subID, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid event id")
	}
	if err := h.repo.DeleteLifeEvent(c.Request().Context(), subID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// ---- Giving Targets ----

func (h *ComponentHandler) CreateGiving(c echo.Context) error {
	planID, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var g domain.GivingTarget
	if err := c.Bind(&g); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	g.ID = uuid.New()
	g.PlanID = planID
	created, err := h.repo.CreateGivingTarget(c.Request().Context(), g)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

func (h *ComponentHandler) UpdateGiving(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var g domain.GivingTarget
	if err := c.Bind(&g); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.repo.UpdateGivingTarget(c.Request().Context(), g); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, g)
}

func (h *ComponentHandler) DeleteGiving(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	subID, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid giving target id")
	}
	if err := h.repo.DeleteGivingTarget(c.Request().Context(), subID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// ---- Children ----

func (h *ComponentHandler) CreateChild(c echo.Context) error {
	planID, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var child domain.Child
	if err := c.Bind(&child); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	child.ID = uuid.New()
	child.PlanID = planID
	created, err := h.repo.CreateChild(c.Request().Context(), child)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, created)
}

func (h *ComponentHandler) UpdateChild(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	var child domain.Child
	if err := c.Bind(&child); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.repo.UpdateChild(c.Request().Context(), child); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, child)
}

func (h *ComponentHandler) DeleteChild(c echo.Context) error {
	_, _, err := h.planID(c)
	if err != nil {
		return err
	}
	subID, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid child id")
	}
	if err := h.repo.DeleteChild(c.Request().Context(), subID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
