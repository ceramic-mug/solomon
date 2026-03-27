package routes

import (
	"github.com/labstack/echo/v4"
	"github.com/solomon/api/handlers"
	mw "github.com/solomon/api/middleware"
)

// Register wires all routes to the Echo instance.
func Register(e *echo.Echo, auth *handlers.AuthHandler, plans *handlers.PlanHandler,
	comp *handlers.ComponentHandler, sim *handlers.SimulateHandler) {

	// ---- Public ----
	e.POST("/auth/register", auth.Register)
	e.POST("/auth/login", auth.Login)

	// ---- Protected ----
	api := e.Group("", mw.RequireAuth)

	// Plans
	api.GET("/plans", plans.ListPlans)
	api.POST("/plans", plans.CreatePlan)
	api.GET("/plans/:id", plans.GetPlan)
	api.PUT("/plans/:id", plans.UpdatePlan)
	api.DELETE("/plans/:id", plans.DeletePlan)
	api.POST("/plans/:id/fork", plans.ForkPlan)

	// Simulation
	api.GET("/plans/:id/simulate", sim.Simulate)
	api.GET("/plans/:id/simulate/monte", sim.SimulateMonteCarlo)
	api.GET("/plans/:id/compare/:other_id", sim.ComparePlans)
	api.GET("/plans/:id/export", sim.ExportPlan)

	// Income
	api.POST("/plans/:id/income", comp.CreateIncome)
	api.PUT("/plans/:id/income/:sid", comp.UpdateIncome)
	api.DELETE("/plans/:id/income/:sid", comp.DeleteIncome)

	// Expenses
	api.POST("/plans/:id/expenses", comp.CreateExpense)
	api.PUT("/plans/:id/expenses/:sid", comp.UpdateExpense)
	api.DELETE("/plans/:id/expenses/:sid", comp.DeleteExpense)

	// Debts
	api.POST("/plans/:id/debts", comp.CreateDebt)
	api.PUT("/plans/:id/debts/:sid", comp.UpdateDebt)
	api.DELETE("/plans/:id/debts/:sid", comp.DeleteDebt)

	// Investments
	api.POST("/plans/:id/investments", comp.CreateInvestment)
	api.PUT("/plans/:id/investments/:sid", comp.UpdateInvestment)
	api.DELETE("/plans/:id/investments/:sid", comp.DeleteInvestment)

	// Life Events
	api.POST("/plans/:id/events", comp.CreateEvent)
	api.DELETE("/plans/:id/events/:sid", comp.DeleteEvent)

	// Giving
	api.POST("/plans/:id/giving", comp.CreateGiving)
	api.DELETE("/plans/:id/giving/:sid", comp.DeleteGiving)
}
