package domain

import "github.com/google/uuid"

// EventType classifies a life event.
type EventType string

const (
	EventTypeIncomeChange   EventType = "income_change"   // Salary bump, new job, etc.
	EventTypeExpenseChange  EventType = "expense_change"  // New recurring expense or removal
	EventTypeOneTimeExpense EventType = "one_time_expense" // Lump sum (e.g. car purchase)
	EventTypeMilestone      EventType = "milestone"       // Informational marker (graduation, marriage)
	EventTypeDebtPayoff     EventType = "debt_payoff"     // Mark a debt as paid off at this month
)

// LifeEvent is a dated occurrence that modifies the financial plan at a specific month.
// Events are applied in month-order during simulation.
type LifeEvent struct {
	ID      uuid.UUID     `json:"id"`
	PlanID  uuid.UUID     `json:"plan_id"`
	Name    string        `json:"name"` // e.g. "Child Born", "Start Attending", "Buy House"
	Type    EventType     `json:"type"`
	Month   int           `json:"month"` // 0-indexed offset from plan start
	Impacts []EventImpact `json:"impacts"`
}

// EventImpact describes a single mutation to a plan component when the event fires.
// TargetType identifies which collection to look in; TargetID is the specific item.
// Operation can be "set", "add", or "multiply".
//
// Examples:
//   - Attending salary starts: set income_stream.amount = 25000 (monthly)
//   - Child born: add expense.monthly_amount = 1500 (childcare)
//   - Year 3 bonus: add income_stream.amount = 5000 (one month)
type EventImpact struct {
	ID         uuid.UUID `json:"id"`
	EventID    uuid.UUID `json:"event_id"`
	TargetType string    `json:"target_type"` // "income_stream" | "expense" | "debt" | "investment"
	TargetID   uuid.UUID `json:"target_id"`
	Field      string    `json:"field"`     // "amount", "monthly_contrib", "extra_payment", "balance", etc.
	NewValue   float64   `json:"new_value"` // used for "set" and "add"
	Operation  string    `json:"operation"` // "set" | "add" | "multiply"
}
