# Solomon — Physician Financial Sandbox

Solomon is a specialized financial modeling and simulation platform designed for medical doctors. it focuses on complex physician-specific financial trajectories, including residency-to-attending transitions, Public Service Loan Forgiveness (PSLF), and long-term wealth building.

## Project Overview

- **Purpose**: A "sandbox" for physicians to model their financial futures using a deterministic simulation engine and an agentic AI advisor (Gemini).
- **Architecture**: Monorepo with a Go backend and a React (TypeScript) frontend.
- **Key Components**:
    - `packages/domain`: Core business logic, entities (Plan, Income, Debt, etc.), and shared types.
    - `packages/simulation`: The deterministic math engine that performs month-by-month projections.
    - `packages/infrastructure`: PostgreSQL repository implementation using GORM.
    - `packages/ai`: Gemini 2.0 Flash agent tool definitions and reasoning loop.
    - `services/api`: Go HTTP service using the Echo framework.
    - `frontend/src`: React application with Vite, Tailwind CSS, and TanStack Query.

## Tech Stack

- **Backend**: Go 1.26+, Echo (Routing), GORM (ORM), PostgreSQL (DB), Gemini 2.0 Flash (AI).
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand (State), TanStack Query (Server State), Recharts/D3 (Visuals).
- **Infrastructure**: Docker Compose, PostgreSQL 16.

## Building and Running

### Prerequisites
- **Docker**: For running PostgreSQL.
- **Go**: Version 1.26 or higher.
- **Node.js & NPM**: For the frontend.
- **Gemini API Key**: Required for AI features (place in `solomon_gemini_api.key` or set `GEMINI_API_KEY` env var).

### Commands
- **Start Everything**: `./start.sh` (Runs Docker and Go API).
- **Backend (Go)**:
    - `make dev`: Start Postgres and the API.
    - `make test`: Run all Go tests.
    - `make build`: Build the API binary.
    - `make lint`: Run `golangci-lint`.
    - `make tidy`: Sync workspace and tidy modules.
- **Frontend (React)**:
    - `cd frontend && npm install`: Install dependencies.
    - `npm run dev`: Start Vite dev server.
    - `npm run build`: Build for production.
    - `npm run lint`: Run ESLint.

## Development Conventions

- **Go Monorepo**: Uses `go.work` to manage multiple packages. Always run `go work sync` after adding dependencies.
- **Simulation Engine**: Logic is month-by-month deterministic. Avoid adding non-deterministic logic directly into the engine; use Monte Carlo passes for probabilistic modeling.
- **Plan Forking**: Plans are designed to be forked for "what-if" scenarios. A forked plan inherits from a parent up to a `ForkMonth`.
- **AI Agent**: Uses Gemini function calling. Tools are defined in `packages/ai`. AI responses are streamed via Server-Sent Events (SSE).
- **Frontend State**: 
    - Use `TanStack Query` for all server-side data fetching and mutations.
    - Use `Zustand` for lightweight global client state (e.g., UI preferences).
    - Use `Tailwind CSS` for styling; avoid custom CSS where possible.
- **Database**: PostgreSQL with `pgvector` enabled for future RAG features. Migrations are handled automatically on startup in `postgres/db.go`.

## Key Files
- `Makefile`: Central hub for backend development commands.
- `docker-compose.yml`: Defines the infrastructure (Postgres).
- `PLAN.md`: Detailed roadmap and feature specifications.
- `DOCS.md`: Technical documentation and identified bugs.
- `packages/domain/plan.go`: The core data model for financial plans.
- `packages/simulation/engine.go`: The heart of the simulation logic.
