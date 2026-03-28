package postgres

import (
	"fmt"

	pg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open connects to PostgreSQL and returns a configured GORM DB instance.
// dsn should be a connection string like:
//
//	postgres://solomon:solomon@localhost:5432/solomon?sslmode=disable
func Open(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(pg.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	return db, nil
}

// Migrate runs AutoMigrate for all Solomon models. Safe to call on every startup.
func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&UserModel{},
		&ProfileModel{},
		&PlanModel{},
		&SimulationConfigModel{},
		&IncomeStreamModel{},
		&ExpenseModel{},
		&DebtAccountModel{},
		&InvestmentAccountModel{},
		&GivingTargetModel{},
		&LifeEventModel{},
		&EventImpactModel{},
	)
}
