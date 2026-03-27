.PHONY: dev api frontend migrate test lint build

# Start PostgreSQL only
db:
	docker compose up postgres -d

# Start all services (DB + API)
dev:
	docker compose up postgres -d
	go run ./services/api/...

# Run API only (assumes DB is up)
api:
	go run ./services/api/...

# Run all Go tests across all packages
test:
	cd packages/simulation && go test ./...
	cd packages/domain && go test ./...

# Run tests with verbose output
test-v:
	cd packages/simulation && go test -v ./...

# Run linter
lint:
	golangci-lint run ./...

# Tidy all modules
tidy:
	go work sync
	cd packages/domain && go mod tidy
	cd packages/simulation && go mod tidy
	cd packages/infrastructure && go mod tidy
	cd packages/ai && go mod tidy
	cd services/api && go mod tidy

# Install Go tools
tools:
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Build API binary
build:
	go build -o bin/api ./services/api/...

# Tear down Docker
down:
	docker compose down

# Tear down and wipe DB volume
reset:
	docker compose down -v
