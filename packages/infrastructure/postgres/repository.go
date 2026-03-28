package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/solomon/domain"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Repository provides all data access methods for Solomon.
// It is the single point of interaction with PostgreSQL.
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ---- Auth ----

func (r *Repository) CreateUser(ctx context.Context, email, password string) (domain.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return domain.User{}, fmt.Errorf("hash password: %w", err)
	}
	m := UserModel{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: string(hash),
	}
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return domain.User{}, fmt.Errorf("create user: %w", err)
	}
	return domain.User{ID: m.ID, Email: m.Email, CreatedAt: m.CreatedAt}, nil
}

func (r *Repository) GetUserByEmail(ctx context.Context, email string) (domain.User, string, error) {
	var m UserModel
	if err := r.db.WithContext(ctx).Where("email = ?", email).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domain.User{}, "", fmt.Errorf("user not found")
		}
		return domain.User{}, "", fmt.Errorf("get user: %w", err)
	}
	return domain.User{ID: m.ID, Email: m.Email, CreatedAt: m.CreatedAt}, m.PasswordHash, nil
}

func (r *Repository) GetUserByID(ctx context.Context, id uuid.UUID) (domain.User, error) {
	var m UserModel
	if err := r.db.WithContext(ctx).First(&m, "id = ?", id).Error; err != nil {
		return domain.User{}, fmt.Errorf("get user by id: %w", err)
	}
	return domain.User{ID: m.ID, Email: m.Email, CreatedAt: m.CreatedAt}, nil
}

// ---- Profile ----

func (r *Repository) CreateProfile(ctx context.Context, p domain.Profile) (domain.Profile, error) {
	m := ProfileModel{
		ID:        uuid.New(),
		UserID:    p.UserID,
		Name:      p.Name,
		StateCode: p.StateCode,
		StateTax:  p.StateTax,
	}
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return domain.Profile{}, fmt.Errorf("create profile: %w", err)
	}
	p.ID = m.ID
	return p, nil
}

func (r *Repository) GetProfileByUserID(ctx context.Context, userID uuid.UUID) (domain.Profile, error) {
	var m ProfileModel
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&m).Error; err != nil {
		return domain.Profile{}, fmt.Errorf("get profile: %w", err)
	}
	return domain.Profile{
		ID:        m.ID,
		UserID:    m.UserID,
		Name:      m.Name,
		StateCode: m.StateCode,
		StateTax:  m.StateTax,
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}, nil
}

// ---- Plans ----

func (r *Repository) CreatePlan(ctx context.Context, p domain.Plan) (domain.Plan, error) {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	// Default simulation config
	if p.SimulationConfig.ID == uuid.Nil {
		p.SimulationConfig = domain.DefaultSimulationConfig(p.ID)
	}

	m := planToModel(p)
	cm := simConfigToModel(p.SimulationConfig)

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&m).Error; err != nil {
			return err
		}
		if err := tx.Create(&cm).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return domain.Plan{}, fmt.Errorf("create plan: %w", err)
	}
	p.SimulationConfig.PlanID = p.ID
	return p, nil
}

func (r *Repository) GetPlan(ctx context.Context, id uuid.UUID) (domain.Plan, error) {
	var m PlanModel
	err := r.db.WithContext(ctx).
		Preload("SimulationConfig").
		Preload("IncomeStreams").
		Preload("Expenses").
		Preload("DebtAccounts").
		Preload("InvestmentAccounts").
		Preload("LifeEvents.Impacts").
		Preload("GivingTargets").
		First(&m, "id = ?", id).Error
	if err != nil {
		return domain.Plan{}, fmt.Errorf("get plan: %w", err)
	}
	return planToDomain(m), nil
}

func (r *Repository) ListPlansByProfile(ctx context.Context, profileID uuid.UUID) ([]domain.Plan, error) {
	var models []PlanModel
	err := r.db.WithContext(ctx).
		Where("profile_id = ?", profileID).
		Order("created_at ASC").
		Find(&models).Error
	if err != nil {
		return nil, fmt.Errorf("list plans: %w", err)
	}
	plans := make([]domain.Plan, len(models))
	for i, m := range models {
		plans[i] = planToDomain(m)
	}
	return plans, nil
}

func (r *Repository) UpdatePlan(ctx context.Context, p domain.Plan) error {
	m := planToModel(p)
	return r.db.WithContext(ctx).Save(&m).Error
}

func (r *Repository) DeletePlan(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tables := []string{
			"event_impacts", "life_events", "giving_targets",
			"investment_accounts", "debt_accounts", "expenses",
			"income_streams", "simulation_configs",
		}
		for _, table := range tables {
			if err := tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE plan_id = ?", table), id).Error; err != nil {
				return err
			}
		}
		return tx.Delete(&PlanModel{}, "id = ?", id).Error
	})
}

// ForkPlan creates a deep copy of a plan, linked to the parent via ParentPlanID.
func (r *Repository) ForkPlan(ctx context.Context, parentID uuid.UUID, forkMonth int, name, description string, byAI bool) (domain.Plan, error) {
	parent, err := r.GetPlan(ctx, parentID)
	if err != nil {
		return domain.Plan{}, fmt.Errorf("fork plan: load parent: %w", err)
	}

	fork := parent
	fork.ID = uuid.New()
	fork.ParentPlanID = &parentID
	fork.ForkMonth = &forkMonth
	fork.Name = name
	fork.Description = description
	fork.CreatedByAI = byAI

	// Reassign all sub-entity IDs and plan references
	fork.SimulationConfig.ID = uuid.New()
	fork.SimulationConfig.PlanID = fork.ID

	for i := range fork.IncomeStreams {
		fork.IncomeStreams[i].ID = uuid.New()
		fork.IncomeStreams[i].PlanID = fork.ID
	}
	for i := range fork.Expenses {
		fork.Expenses[i].ID = uuid.New()
		fork.Expenses[i].PlanID = fork.ID
	}
	for i := range fork.DebtAccounts {
		fork.DebtAccounts[i].ID = uuid.New()
		fork.DebtAccounts[i].PlanID = fork.ID
	}
	for i := range fork.InvestmentAccounts {
		fork.InvestmentAccounts[i].ID = uuid.New()
		fork.InvestmentAccounts[i].PlanID = fork.ID
	}
	for i := range fork.GivingTargets {
		fork.GivingTargets[i].ID = uuid.New()
		fork.GivingTargets[i].PlanID = fork.ID
	}
	for i := range fork.LifeEvents {
		fork.LifeEvents[i].ID = uuid.New()
		fork.LifeEvents[i].PlanID = fork.ID
		for j := range fork.LifeEvents[i].Impacts {
			fork.LifeEvents[i].Impacts[j].ID = uuid.New()
			fork.LifeEvents[i].Impacts[j].EventID = fork.LifeEvents[i].ID
		}
	}

	return r.savePlanFull(ctx, fork)
}

// savePlanFull persists a plan and all its sub-entities in a single transaction.
func (r *Repository) savePlanFull(ctx context.Context, p domain.Plan) (domain.Plan, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&PlanModel{
			ID: p.ID, ProfileID: p.ProfileID, ParentPlanID: p.ParentPlanID,
			ForkMonth: p.ForkMonth, Name: p.Name, Description: p.Description,
			CreatedByAI: p.CreatedByAI,
		}).Error; err != nil {
			return err
		}
		if err := tx.Create(simConfigToModel(p.SimulationConfig)).Error; err != nil {
			return err
		}
		for _, s := range p.IncomeStreams {
			if err := tx.Create(incomeStreamToModel(s)).Error; err != nil {
				return err
			}
		}
		for _, e := range p.Expenses {
			if err := tx.Create(expenseToModel(e)).Error; err != nil {
				return err
			}
		}
		for _, d := range p.DebtAccounts {
			if err := tx.Create(debtToModel(d)).Error; err != nil {
				return err
			}
		}
		for _, inv := range p.InvestmentAccounts {
			m := investmentToModel(inv)
			if err := tx.Create(&m).Error; err != nil {
				return err
			}
		}
		for _, g := range p.GivingTargets {
			if err := tx.Create(givingToModel(g)).Error; err != nil {
				return err
			}
		}
		for _, ev := range p.LifeEvents {
			m := lifeEventToModel(ev)
			if err := tx.Create(&LifeEventModel{
				ID: m.ID, PlanID: m.PlanID, Name: m.Name, Type: m.Type, Month: m.Month,
			}).Error; err != nil {
				return err
			}
			for _, imp := range m.Impacts {
				if err := tx.Create(&imp).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return domain.Plan{}, fmt.Errorf("save plan full: %w", err)
	}
	return p, nil
}

// ---- Income Streams ----

func (r *Repository) CreateIncomeStream(ctx context.Context, s domain.IncomeStream) (domain.IncomeStream, error) {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	m := incomeStreamToModel(s)
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return domain.IncomeStream{}, fmt.Errorf("create income stream: %w", err)
	}
	return s, nil
}

func (r *Repository) UpdateIncomeStream(ctx context.Context, s domain.IncomeStream) error {
	return r.db.WithContext(ctx).Save(incomeStreamToModel(s)).Error
}

func (r *Repository) DeleteIncomeStream(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&IncomeStreamModel{}, "id = ?", id).Error
}

// ---- Expenses ----

func (r *Repository) CreateExpense(ctx context.Context, e domain.Expense) (domain.Expense, error) {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	m := expenseToModel(e)
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return domain.Expense{}, fmt.Errorf("create expense: %w", err)
	}
	return e, nil
}

func (r *Repository) UpdateExpense(ctx context.Context, e domain.Expense) error {
	return r.db.WithContext(ctx).Save(expenseToModel(e)).Error
}

func (r *Repository) DeleteExpense(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&ExpenseModel{}, "id = ?", id).Error
}

// ---- Debt ----

func (r *Repository) CreateDebt(ctx context.Context, d domain.DebtAccount) (domain.DebtAccount, error) {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	m := debtToModel(d)
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return domain.DebtAccount{}, fmt.Errorf("create debt: %w", err)
	}
	return d, nil
}

func (r *Repository) UpdateDebt(ctx context.Context, d domain.DebtAccount) error {
	return r.db.WithContext(ctx).Save(debtToModel(d)).Error
}

func (r *Repository) DeleteDebt(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&DebtAccountModel{}, "id = ?", id).Error
}

// ---- Investments ----

func (r *Repository) CreateInvestment(ctx context.Context, inv domain.InvestmentAccount) (domain.InvestmentAccount, error) {
	if inv.ID == uuid.Nil {
		inv.ID = uuid.New()
	}
	m := investmentToModel(inv)
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return domain.InvestmentAccount{}, fmt.Errorf("create investment: %w", err)
	}
	return inv, nil
}

func (r *Repository) UpdateInvestment(ctx context.Context, inv domain.InvestmentAccount) error {
	m := investmentToModel(inv)
	return r.db.WithContext(ctx).Save(&m).Error
}

func (r *Repository) DeleteInvestment(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&InvestmentAccountModel{}, "id = ?", id).Error
}

// ---- Life Events ----

func (r *Repository) CreateLifeEvent(ctx context.Context, ev domain.LifeEvent) (domain.LifeEvent, error) {
	if ev.ID == uuid.Nil {
		ev.ID = uuid.New()
	}
	m := lifeEventToModel(ev)
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&LifeEventModel{
			ID: m.ID, PlanID: m.PlanID, Name: m.Name, Type: m.Type, Month: m.Month,
		}).Error; err != nil {
			return err
		}
		for i := range m.Impacts {
			if m.Impacts[i].ID == uuid.Nil {
				m.Impacts[i].ID = uuid.New()
			}
			m.Impacts[i].EventID = m.ID
			if err := tx.Create(&m.Impacts[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return domain.LifeEvent{}, fmt.Errorf("create life event: %w", err)
	}
	return ev, nil
}

func (r *Repository) UpdateLifeEvent(ctx context.Context, ev domain.LifeEvent) error {
	m := lifeEventToModel(ev)
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&LifeEventModel{
			ID: m.ID, PlanID: m.PlanID, Name: m.Name, Type: m.Type, Month: m.Month,
		}).Error; err != nil {
			return err
		}
		// Simple approach: delete all impacts and recreate them
		if err := tx.Delete(&EventImpactModel{}, "event_id = ?", m.ID).Error; err != nil {
			return err
		}
		for i := range m.Impacts {
			if m.Impacts[i].ID == uuid.Nil {
				m.Impacts[i].ID = uuid.New()
			}
			m.Impacts[i].EventID = m.ID
			if err := tx.Create(&m.Impacts[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) DeleteLifeEvent(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&EventImpactModel{}, "event_id = ?", id).Error; err != nil {
			return err
		}
		return tx.Delete(&LifeEventModel{}, "id = ?", id).Error
	})
}

// ---- Giving ----

func (r *Repository) CreateGivingTarget(ctx context.Context, g domain.GivingTarget) (domain.GivingTarget, error) {
	if g.ID == uuid.Nil {
		g.ID = uuid.New()
	}
	m := givingToModel(g)
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return domain.GivingTarget{}, fmt.Errorf("create giving target: %w", err)
	}
	return g, nil
}

func (r *Repository) UpdateGivingTarget(ctx context.Context, g domain.GivingTarget) error {
	return r.db.WithContext(ctx).Save(givingToModel(g)).Error
}

func (r *Repository) DeleteGivingTarget(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&GivingTargetModel{}, "id = ?", id).Error
}

// UpdateSimulationConfig persists changes to a plan's simulation configuration.
func (r *Repository) UpdateSimulationConfig(ctx context.Context, c domain.SimulationConfig) error {
	return r.db.WithContext(ctx).Save(simConfigToModel(c)).Error
}

// ensure json import is used
var _ = json.Marshal
