module github.com/solomon/infrastructure

go 1.26.1

require (
	github.com/google/uuid v1.6.0
	github.com/solomon/domain v0.0.0
	golang.org/x/crypto v0.49.0
	gorm.io/datatypes v1.2.7
	gorm.io/driver/postgres v1.5.0
	gorm.io/gorm v1.30.0
)

replace github.com/solomon/domain => ../domain

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/go-sql-driver/mysql v1.8.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx/v5 v5.5.5 // indirect
	github.com/jackc/puddle/v2 v2.2.1 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/text v0.35.0 // indirect
	gorm.io/driver/mysql v1.5.6 // indirect
)
