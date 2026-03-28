# Solomon — Build Progress

## What's been built

### Phase 1 — Core Backend & Frontend Scaffold
- **Go monorepo** (`go.work`) with four packages: `domain`, `simulation`, `infrastructure`, `ai`
- **Domain model**: Plan, IncomeStream, ExpenseCategory, DebtAccount, InvestmentAccount, LifeEvent, GivingTarget — all physician-aware
- **Simulation engine**: monthly amortization loop, compound investment growth, marginal tax + FICA, PSLF qualifying payment tracker, Monte Carlo (1000-run, P10–P90)
- **Echo API** with JWT auth, full CRUD for plans and all six entity types, `/simulate` and `/simulate/monte` endpoints
- **React + Vite + TypeScript** frontend scaffold with TanStack Query, Zustand, Recharts

### Phase 2 — Full Plan Editor UI
- **PlanEditor** page with six tabs: Income, Expenses, Debts, Investments, Life Events, Giving
- Add/edit/delete modals for every entity type
- Live 30-year net worth chart on Dashboard using simulation results
- Scenario fork modal and plan selector tabs
### Phase 4 — AI Agent & Chat UI
- **Gemini agent** (`gemini-3-flash-preview`) with 12 plan-manipulation tools: create_fork, add_income, add_expense, add_debt, add_investment, add_life_event, modify_income, run_simulation, compare_plans, get_plan, list_plans
- **SSE streaming** chat endpoint (`POST /ai/chat`) showing tool call progress in real time
- **AIChat page** with streaming message bubbles, tool call badges, and physician-specific example prompts
- **State tax auto-fill** on account creation: debounces state code input, calls Gemini to look up the current flat income tax rate

### Bug Fixes & Refinements (Test-and-Debug Phase)
- **Auth Persistence**: Added `/auth/refresh` endpoint and refresh token storage in frontend.
- **Axios Interceptor**: Implemented automatic token refresh on 401 errors to prevent session loss.
- **Scenarios Page**: Fixed "Too many re-renders" infinite loop caused by incorrect `useQuery` usage.
- **AI Agent**: Added missing `add_income` tool to the agentic loop.
- **Type Safety**: Improved null-handling in formatting functions.

## What's next

### Infrastructure
- Docker Compose: PostgreSQL 16 + Go API + Vite dev server
- API on port 8082, Postgres on 5434 (avoids common local conflicts)
- Gemini API key loaded from `solomon_gemini_api.key` file (git-ignored)
- `start.sh` script: rebuilds Docker, waits for health check, starts frontend

## What's next

- **Phase 3**: Monte Carlo fan chart (D3.js P10/P50/P90 bands), scenario tree UI, side-by-side comparison view
- **Phase 5**: PSLF optimizer view, Sankey cash flow diagram, contribution optimizer, AI conversation history, Settings page
