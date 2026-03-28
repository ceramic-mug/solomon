// Package postgres provides GORM model definitions and repository implementations
// for persisting Solomon domain entities to PostgreSQL.
//
// GORM uses struct field tags to map Go types to SQL columns.
// Each model mirrors its domain counterpart but adds GORM-specific concerns
// (composite primary keys, foreign key constraints, JSON serialization for
// embedded structs like AssetAllocation).
package postgres

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// ---- Users & Profiles ----

type UserModel struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	Email        string    `gorm:"uniqueIndex;not null"`
	PasswordHash string    `gorm:"not null"`
	CreatedAt    time.Time
}

func (UserModel) TableName() string { return "users" }

type ProfileModel struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index"`
	Name      string    `gorm:"not null"`
	StateCode string    `gorm:"size:2"`
	StateTax  float64
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (ProfileModel) TableName() string { return "profiles" }

// ---- Plans ----

type PlanModel struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey"`
	ProfileID    uuid.UUID  `gorm:"type:uuid;not null;index"`
	ParentPlanID *uuid.UUID `gorm:"type:uuid;index"`
	ForkMonth    *int
	Name         string `gorm:"not null"`
	Description  string
	CreatedByAI  bool `gorm:"default:false"`
	CreatedAt    time.Time
	UpdatedAt    time.Time

	// Relations — loaded with Preload
	SimulationConfig   SimulationConfigModel    `gorm:"foreignKey:PlanID"`
	IncomeStreams       []IncomeStreamModel      `gorm:"foreignKey:PlanID"`
	Expenses           []ExpenseModel           `gorm:"foreignKey:PlanID"`
	DebtAccounts       []DebtAccountModel       `gorm:"foreignKey:PlanID"`
	InvestmentAccounts []InvestmentAccountModel `gorm:"foreignKey:PlanID"`
	LifeEvents         []LifeEventModel         `gorm:"foreignKey:PlanID"`
	GivingTargets      []GivingTargetModel      `gorm:"foreignKey:PlanID"`
}

func (PlanModel) TableName() string { return "plans" }

type SimulationConfigModel struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey"`
	PlanID           uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"`
	StartYear        int       `gorm:"not null"`
	StartMonth       int       `gorm:"not null"`
	HorizonYears     int       `gorm:"not null;default:30"`
	InflationRate    float64   `gorm:"not null;default:0.03"`
	MonteCarloPasses int       `gorm:"not null;default:1000"`
	StockMeanReturn  float64   `gorm:"not null;default:0.07"`
	StockStdDev      float64   `gorm:"not null;default:0.15"`
	BondMeanReturn   float64   `gorm:"not null;default:0.04"`
	BondStdDev       float64   `gorm:"not null;default:0.06"`

	// Cash flow constraint
	TargetCashFlow       float64 `gorm:"not null;default:0"`
	ConstrainGiving      bool    `gorm:"not null;default:false"`
	ConstrainSavings     bool    `gorm:"not null;default:false"`
	ConstrainInvestments bool    `gorm:"not null;default:false"`
}

func (SimulationConfigModel) TableName() string { return "simulation_configs" }

// ---- Income ----

type IncomeStreamModel struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	PlanID      uuid.UUID `gorm:"type:uuid;not null;index"`
	Name        string    `gorm:"not null"`
	Type        string    `gorm:"not null"`
	TaxCategory string    `gorm:"not null"`
	Amount      float64   `gorm:"not null"`
	GrowthRate  float64   `gorm:"default:0"`
	StartMonth  int       `gorm:"not null;default:0"`
	EndMonth    *int
}

func (IncomeStreamModel) TableName() string { return "income_streams" }

// ---- Expenses ----

type ExpenseModel struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey"`
	PlanID        uuid.UUID `gorm:"type:uuid;not null;index"`
	Name          string    `gorm:"not null"`
	Category      string    `gorm:"not null"`
	MonthlyAmount float64   `gorm:"not null"`
	GrowthRate    float64   `gorm:"default:0"`
	StartMonth    int       `gorm:"not null;default:0"`
	EndMonth      *int
	IsOneTime     bool `gorm:"default:false"`
}

func (ExpenseModel) TableName() string { return "expenses" }

// ---- Debt ----

type DebtAccountModel struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey"`
	PlanID            uuid.UUID `gorm:"type:uuid;not null;index"`
	Name              string    `gorm:"not null"`
	Type              string    `gorm:"not null"`
	OriginalPrincipal float64   `gorm:"not null"`
	Balance           float64   `gorm:"not null"`
	InterestRate      float64   `gorm:"not null"`
	MinPayment        float64   `gorm:"not null;default:0"`
	ExtraPayment      float64   `gorm:"default:0"`
	StartMonth        int       `gorm:"not null;default:0"`
	RepaymentPlan     string  `gorm:"not null;default:'standard'"`
	PSLFEligible      bool    `gorm:"default:false"`
	PSLFPaymentsMade  int     `gorm:"default:0"`
	PropertyValue     float64 `gorm:"default:0"`
	AppreciationRate  float64 `gorm:"default:0.03"`
}

func (DebtAccountModel) TableName() string { return "debt_accounts" }

// ---- Investments ----

type InvestmentAccountModel struct {
	ID               uuid.UUID      `gorm:"type:uuid;primaryKey"`
	PlanID           uuid.UUID      `gorm:"type:uuid;not null;index"`
	Name             string         `gorm:"not null"`
	Type             string         `gorm:"not null"`
	Balance          float64        `gorm:"not null;default:0"`
	MonthlyContrib   float64        `gorm:"not null;default:0"`
	EmployerMatch    float64        `gorm:"default:0"`
	EmployerMatchCap float64        `gorm:"default:0"`
	AssetAllocation  datatypes.JSON `gorm:"type:jsonb;not null"`
	StartMonth       int            `gorm:"not null;default:0"`
	GoalTarget       float64        `gorm:"default:0"`
	GoalLabel        string         `gorm:"default:''"`
}

func (InvestmentAccountModel) TableName() string { return "investment_accounts" }

type GivingTargetModel struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	PlanID      uuid.UUID `gorm:"type:uuid;not null;index"`
	Name        string    `gorm:"not null"`
	Basis       string    `gorm:"not null;default:'gross'"`
	Percentage  float64   `gorm:"not null;default:0.10"`
	FixedAmount *float64
	StartMonth  int  `gorm:"not null;default:0"`
	EndMonth    *int
}

func (GivingTargetModel) TableName() string { return "giving_targets" }

// ---- Life Events ----

type LifeEventModel struct {
	ID      uuid.UUID         `gorm:"type:uuid;primaryKey"`
	PlanID  uuid.UUID         `gorm:"type:uuid;not null;index"`
	Name    string            `gorm:"not null"`
	Type    string            `gorm:"not null"`
	Month   int               `gorm:"not null"`
	Impacts []EventImpactModel `gorm:"foreignKey:EventID"`
}

func (LifeEventModel) TableName() string { return "life_events" }

type EventImpactModel struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey"`
	EventID    uuid.UUID `gorm:"type:uuid;not null;index"`
	TargetType string    `gorm:"not null"`
	TargetID   uuid.UUID `gorm:"type:uuid;not null"`
	Field      string    `gorm:"not null"`
	NewValue   float64   `gorm:"not null"`
	Operation  string    `gorm:"not null;default:'set'"`
}

func (EventImpactModel) TableName() string { return "event_impacts" }
