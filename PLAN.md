# Solomon — Financial Modeling & Simulation Platform

## Context

Joshua and his wife are entering residency in July 2026. They face a layered financial situation:
- Multiple debt types (medical school, home, auto)
- Predictable income trajectory: residency (~$60-90k/yr) → attending ($200-600k+ depending on specialty)
- Desire to invest wisely, minimize taxes, and give generously to church/community
- Physician-specific considerations: PSLF eligibility, backdoor Roth IRA, 457(b) plans, HSA triple advantage

The goal is a **financial sandbox** — a beautiful, mathematically rigorous app where users model multiple futures, fork scenarios ("what if I aggressively pay PSLF vs. refinance?"), and converse with an AI agent that can create and compare forks using natural language. Built in Go as a learning exercise, with a web UI suitable for homelab self-hosting and future commercialization.

Project name: **Solomon** (the working directory).

---

## Architecture

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend | Go 1.22+, Echo framework | Echo: clean architecture, excellent docs, idiomatic Go — good for learning |
| Database | PostgreSQL 16 + GORM | GORM is learner-friendly, handles complex models well |
| Frontend | React 18 + TypeScript + Vite | Rich charts (D3/Recharts), scenario comparison UI; better than HTMX for interactive financial dashboards |
| Styling | Tailwind CSS + shadcn/ui | Professional, fast to build |
| Auth | JWT + refresh tokens | Sessions stored in DB; cookie-based for security |
| AI Agent | Gemini API (gemini-2.0-flash) | Natural language → plan mutations; tool-calling for multi-step scenario creation |
| MCP Server | Go MCP server (mark3labs/mcp-go) | Exposes Solomon plan tools to Gemini agent; standard protocol for future extensibility |
| Charts | Recharts + D3.js | Recharts for standard charts, D3 for Monte Carlo fan charts + Sankey diagrams |
| Deployment | Docker Compose | Single `docker-compose up` for homelab; future: multi-platform |

### Monorepo Structure

```
solomon/
├── go.work                          # Go workspace (Go 1.22+)
├── Makefile                         # Dev commands: make dev, make test, make build
├── docker-compose.yml               # Postgres + API + Frontend
│
├── services/
│   └── api/                         # Go API server (Echo) — HTTP + MCP
│       ├── go.mod
│       ├── main.go
│       ├── handlers/                # HTTP request handlers
│       ├── middleware/              # JWT auth, logging, CORS
│       └── routes/                  # Route registration
│
├── packages/
│   ├── domain/                      # Core entities — zero external dependencies
│   │   ├── go.mod
│   │   ├── profile.go               # User, Profile
│   │   ├── plan.go                  # Plan, Fork metadata
│   │   ├── income.go                # IncomeStream
│   │   ├── expense.go               # ExpenseCategory
│   │   ├── debt.go                  # DebtAccount (student, mortgage, auto)
│   │   ├── investment.go            # InvestmentAccount (401k, Roth, brokerage, HSA, 457b)
│   │   ├── event.go                 # LifeEvent (income change, life milestone)
│   │   └── simulation.go            # SimulationResult, MonthSnapshot types
│   │
│   ├── simulation/                  # Math engine — pure functions, no DB/HTTP
│   │   ├── go.mod
│   │   ├── engine.go                # Orchestrates monthly simulation loop
│   │   ├── amortization.go          # Loan amortization: M = P×J / [1-(1+J)^-N]
│   │   ├── compound.go              # Investment compounding, real vs nominal
│   │   ├── monte_carlo.go           # 1000-run MC with N(μ,σ) per asset class
│   │   ├── tax.go                   # Marginal bracket calc, FICA, standard deduction
│   │   ├── debt_strategy.go         # Avalanche, snowball, hybrid comparators
│   │   ├── pslf.go                  # PSLF qualifying payment tracker + forgiveness model
│   │   └── cashflow.go              # Monthly net cash flow calculation
│   │
│   ├── ai/                          # Gemini agent + MCP server tools
│   │   ├── go.mod
│   │   ├── gemini.go                # Gemini API client (google-generativeai-go)
│   │   ├── agent.go                 # Agentic loop: query → tool calls → response
│   │   └── mcp_server.go           # MCP server exposing Solomon tools to Gemini
│   │
│   └── infrastructure/
│       ├── go.mod
│       └── postgres/                # GORM models + repository implementations
│
└── frontend/                        # React + TypeScript + Vite
    ├── src/
    │   ├── api/                     # Type-safe API client (fetch + React Query)
    │   ├── components/
    │   │   ├── charts/              # NetWorthChart, DebtPayoffChart, MonteCarloFan, SankeyFlow
    │   │   ├── timeline/            # LifeEventTimeline, EventMarker
    │   │   ├── scenarios/           # ScenarioTree, ScenarioDiff, ForkModal
    │   │   ├── chat/                # AIChatPanel, MessageBubble, ToolCallIndicator
    │   │   └── forms/               # PlanForm, IncomeForm, DebtForm, InvestmentForm
    │   ├── pages/                   # Dashboard, PlanEditor, Scenarios, Chat, Settings
    │   └── store/                   # Zustand for UI state (scenario selection, active plan)
    └── package.json
```

---

## Core Domain Model

### Plan & Fork System

```go
// A Plan is a complete financial universe.
// Forked plans inherit the parent's state up to fork_month,
// then diverge from there — "delta" pattern (not full copies).

type Plan struct {
    ID           uuid.UUID
    ProfileID    uuid.UUID
    ParentPlanID *uuid.UUID   // nil = root plan
    ForkMonth    *int         // month index where this branch diverges
    Name         string
    Description  string
    CreatedAt    time.Time
    CreatedByAI  bool         // true if this fork was generated by the AI agent

    IncomeStreams       []IncomeStream
    ExpenseCategories  []ExpenseCategory
    DebtAccounts       []DebtAccount
    InvestmentAccounts []InvestmentAccount
    LifeEvents         []LifeEvent
    GivingTargets      []GivingTarget
    SimulationConfig   SimulationConfig
}

type SimulationConfig struct {
    StartDate        time.Time
    HorizonYears     int       // e.g. 30
    InflationRate    float64   // e.g. 0.03
    MonteCarloPasses int       // e.g. 1000
    StockMeanReturn  float64
    StockStdDev      float64
    BondMeanReturn   float64
    BondStdDev       float64
}
```

### Income Streams (Physician-aware)

```go
type IncomeStream struct {
    ID          uuid.UUID
    Name        string         // "Residency Salary", "Attending Salary"
    Type        IncomeType     // Salary, Bonus, SideIncome, Investment, Rental
    Amount      float64        // monthly gross
    StartMonth  int            // 0-indexed from plan start
    EndMonth    *int           // nil = indefinite
    GrowthRate  float64        // annual raise %
    TaxCategory TaxCategory    // W2, SelfEmployed, Passive
}
```

### Debt Accounts

```go
type DebtAccount struct {
    ID               uuid.UUID
    Name             string
    Type             DebtType        // StudentLoan, Mortgage, Auto, CreditCard, Personal
    Principal        float64
    InterestRate     float64         // annual %
    MinPayment       float64
    ExtraPayment     float64
    StartMonth       int
    RepaymentPlan    RepaymentPlan   // Standard, IDR, PAYE, SAVE
    PSLFEligible     bool
    PSLFPaymentsMade int
}
```

### Investment Accounts

```go
type InvestmentAccount struct {
    ID               uuid.UUID
    Name             string
    Type             AccountType     // TradIRA, RothIRA, Roth401k, Trad401k, HSA, 457b, Taxable, 529
    Balance          float64
    MonthlyContrib   float64
    EmployerMatch    float64         // % of salary
    EmployerMatchCap float64         // % of salary cap
    AssetAllocation  AssetAllocation // {StockPct, BondPct, CashPct}
    StartMonth       int
}
```

### Life Events

```go
type LifeEvent struct {
    ID      uuid.UUID
    Name    string      // "Start Attending", "Buy House", "Child Born"
    Type    EventType   // IncomeChange, ExpenseChange, OneTimeExpense, Milestone
    Month   int         // Absolute month index from plan start
    Impacts []EventImpact
}

type EventImpact struct {
    TargetType string    // "income_stream", "expense", "debt", "investment"
    TargetID   uuid.UUID
    Field      string    // "amount", "monthly_contrib", "extra_payment"
    NewValue   float64
    Operation  string    // "set", "add", "multiply"
}
```

---

## Simulation Engine

The engine runs **discrete monthly time steps** for `horizon_years × 12` months.

### Monthly Loop (per month M):

1. **Resolve active income** — filter `IncomeStreams` where `start_month <= M <= end_month`
2. **Apply life events** for month M (mutate affected streams/expenses in place)
3. **Calculate gross income** → apply tax model → derive net income
4. **Process debt payments**:
   - Interest accrual + amortized payment per `DebtAccount`
   - Track PSLF qualifying payments (IDR + nonprofit employer)
   - Apply avalanche/snowball strategy to any surplus cash
5. **Apply expenses** — sum active expense categories for month M
6. **Apply investment contributions** — cap against IRS annual limits (tracked per calendar year)
7. **Compound investment balances** — monthly return = `(1 + annual_return)^(1/12) - 1`
8. **Record `MonthSnapshot`**: net worth, cash flow, balances per account, debt totals

### Monte Carlo

```
For run 1..1000:
  For each month M:
    stock_return = sample N(stockMean/12, stockStdDev/sqrt(12))
    bond_return  = sample N(bondMean/12, bondStdDev/sqrt(12))
    → compound investments with sampled return
  → record terminal net worth
Output: P10, P25, P50, P75, P90 per month across all runs
```

### Tax Model

- Gross → pre-tax deductions (401k, HSA, health insurance) → AGI
- AGI → standard deduction → taxable income
- Marginal bracket lookup (2026 brackets stored in config, updateable)
- FICA: 7.65% on W2 income up to Social Security wage base
- State tax: flat rate per profile
- IDR payment = 10% of discretionary income (AGI - 150% poverty line) — used for PSLF modeling

---

## AI Agent Layer (Gemini + MCP)

This is the most distinctive feature of Solomon. The AI agent accepts natural language queries, reasons about the user's financial plan, and autonomously creates forks, events, and comparisons — then explains what it did.

### Architecture

```
User query: "What if I have a kid in my third year of residency?"
     │
     ▼
Frontend AIChatPanel
     │  (POST /ai/chat with plan_id + message)
     ▼
services/api/handlers/ai_handler.go
     │
     ▼
packages/ai/agent.go  ← Gemini 2.0 Flash with tool calling
     │
     ├── [Tool: get_plan]          → fetch current plan data
     ├── [Tool: create_fork]       → fork plan at month ~24
     ├── [Tool: add_life_event]    → "Child Born" event at month 24
     ├── [Tool: add_expense]       → childcare ~$1,500/mo starting month 24
     ├── [Tool: add_expense]       → increased health insurance cost
     ├── [Tool: modify_income]     → parental leave impact (optional, ask user)
     ├── [Tool: run_simulation]    → simulate the new fork
     └── [Tool: compare_plans]    → return delta summary vs. base plan
     │
     ▼
AI synthesizes results:
"I created a fork 'Child in Year 3' starting month 24. Here's how it affects you:
 - Net worth at year 10: -$47,200 vs base plan
 - Childcare adds ~$18,000/yr through age 5
 - Your PSLF trajectory is unaffected
 View the comparison in the Scenarios tab."
```

### MCP Server Tools (exposed to Gemini)

The MCP server (`packages/ai/mcp_server.go`) wraps the plan service and exposes these tools:

| Tool | Description | Key Parameters |
|---|---|---|
| `get_plan` | Fetch full plan data | `plan_id` |
| `get_simulation` | Fetch latest simulation results | `plan_id` |
| `create_fork` | Fork a plan at a specific month | `plan_id`, `fork_month`, `name`, `description` |
| `add_life_event` | Add a life event with impacts | `plan_id`, `name`, `type`, `month`, `impacts[]` |
| `add_expense` | Add an expense category | `plan_id`, `name`, `monthly_amount`, `start_month`, `end_month` |
| `modify_income` | Change an income stream | `plan_id`, `stream_id`, `field`, `new_value`, `effective_month` |
| `add_debt` | Add a debt account | `plan_id`, `name`, `type`, `principal`, `rate`, `payment` |
| `add_investment` | Add/modify investment account | `plan_id`, `name`, `type`, `monthly_contrib` |
| `run_simulation` | Trigger simulation run | `plan_id`, `monte_carlo: bool` |
| `compare_plans` | Return delta summary | `plan_a_id`, `plan_b_id`, `at_years[]` |
| `list_plans` | List all plans in tree | (none) |

### Gemini Configuration

```go
// packages/ai/gemini.go
model := client.GenerativeModel("gemini-2.0-flash")
model.Tools = []*genai.Tool{mcpToolSchema}  // MCP tools as Gemini tool definitions
model.SystemInstruction = &genai.Content{
    Parts: []genai.Part{genai.Text(solomonSystemPrompt)},
}
```

**System prompt** gives Gemini context about Solomon's domain model, typical physician financial patterns, IRS contribution limits, how months are indexed, and instructions to:
- Always confirm destructive operations (deleting a plan) before executing
- Annotate AI-created forks with `created_by_ai: true`
- Return a plain-English summary of every action taken
- Surface comparison numbers at 5yr, 10yr, 20yr, and retirement horizon

### Multi-Agent Scenarios

For complex queries, the agent can invoke multiple sequential tool calls within one response cycle:

**"Model PSLF vs aggressive payoff":**
1. `create_fork` → "PSLF Path" (keep IDR payments, invest surplus)
2. `create_fork` → "Aggressive Payoff" (max student loan payment)
3. `run_simulation` × 2
4. `compare_plans` → net worth delta, break-even year, total interest paid
5. Return narrative with recommendation

---

## API Design (RESTful, JSON)

```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh

GET    /plans                         # List user's plans (tree structure)
POST   /plans                         # Create root plan
GET    /plans/:id                     # Get plan with all data
PUT    /plans/:id                     # Update plan
POST   /plans/:id/fork                # Fork plan at month M
DELETE /plans/:id

GET    /plans/:id/simulate            # Run deterministic simulation
GET    /plans/:id/simulate/monte      # Run Monte Carlo simulation
GET    /plans/:id/compare/:other_id   # Compare two plans (delta summary)
GET    /plans/:id/export              # Export plan as JSON

POST   /plans/:id/income
PUT    /plans/:id/income/:iid
DELETE /plans/:id/income/:iid

POST   /plans/:id/debts
PUT    /plans/:id/debts/:did
DELETE /plans/:id/debts/:did

POST   /plans/:id/investments
PUT    /plans/:id/investments/:vid
DELETE /plans/:id/investments/:vid

POST   /plans/:id/events
PUT    /plans/:id/events/:eid
DELETE /plans/:id/events/:eid

POST   /ai/chat                       # Send message to AI agent (streaming response)
GET    /ai/history/:plan_id           # Conversation history for a plan
```

### AI Chat Endpoint

```
POST /ai/chat
Body: { "plan_id": "uuid", "message": "What if I have a kid in year 3?" }
Response: Server-Sent Events (streaming)
  → event: tool_call   { tool: "create_fork", params: {...} }
  → event: tool_result { tool: "create_fork", result: {...} }
  → event: message     { text: "I created a fork..." }
  → event: done
```

Streaming with SSE allows the frontend to show tool call progress in real time ("Creating fork... Running simulation... Comparing plans...").

---

## Export JSON Schema

```json
{
  "schema_version": "1.0",
  "exported_at": "2026-03-27T00:00:00Z",
  "plan": {
    "id": "uuid",
    "name": "Base Plan",
    "parent_plan_id": null,
    "fork_month": null,
    "created_by_ai": false,
    "simulation_config": { "horizon_years": 30, "inflation_rate": 0.03, ... },
    "income_streams": [ { "id", "name", "type", "amount", "start_month", "end_month", "growth_rate" } ],
    "expense_categories": [ { "id", "name", "monthly_amount", "category", "start_month", "end_month" } ],
    "debt_accounts": [ { "id", "name", "type", "principal", "rate", "payment", "repayment_plan", "pslf_eligible" } ],
    "investment_accounts": [ { "id", "name", "type", "balance", "monthly_contrib", "asset_allocation" } ],
    "life_events": [ { "id", "name", "month", "impacts": [ ... ] } ],
    "giving_targets": [ { "name", "amount", "basis": "gross|net", "frequency": "monthly" } ]
  },
  "simulation_result": {
    "monthly_snapshots": [ { "month", "net_worth", "cash_flow", "gross_income", "taxes_paid", "total_debt", "total_investments" } ],
    "monte_carlo": { "percentiles": { "p10": [...], "p25": [...], "p50": [...], "p75": [...], "p90": [...] } }
  }
}
```

---

## UI Key Views

1. **Dashboard** — 30yr net worth projection (line chart), monthly cash flow, scenario switcher, AI chat entrypoint
2. **Plan Editor** — Income streams, expenses, debts, investments as data tables with inline editing; life events on a horizontal timeline
3. **Scenario Tree** — Visual tree of forked plans (react-flow); AI-generated forks labeled with sparkle indicator; click to view, compare, or fork again
4. **Scenario Compare** — Two plans overlaid (solid vs dashed lines); delta summary panel with $ differences at 5/10/20/30yr; AI-generated comparison narrative
5. **AI Chat Panel** — Side-drawer chat interface; shows streaming tool call progress ("Creating fork... Running simulation..."); past conversation history per plan
6. **PSLF Optimizer** — Dedicated view: PSLF path vs. aggressive payoff (AI can generate both forks on demand)
7. **Cash Flow Sankey** — Income → taxes → expenses → debt → investments → savings
8. **Monte Carlo View** — Fan chart (P10/P25/P50/P75/P90 bands), retirement success probability

---

## Physician-Specific Features (Built-In)

- **PSLF tracker**: tracks qualifying payments per loan, projects forgiveness month and forgiven amount
- **Backdoor Roth wizard**: models conversion steps and pro-rata rule risk
- **Contribution optimizer**: auto-sequences 401k match → HSA → 401k max → backdoor Roth → 457b → taxable
- **Pre-tax vs. post-tax giving toggle**: model 10% of gross vs net, with DAF strategy option
- **Attending transition event template**: one-click life event for the residency→attending income jump
- **AI knows physician domain**: system prompt includes PSLF rules, 2026 IRS limits, typical resident/attending income ranges, common physician financial decisions

---

## Phased Implementation Plan

### Phase 1 — Core Simulation Engine (Weeks 1-3)
- Go module setup (`go.work`), Docker Compose (PostgreSQL 16)
- Domain entities (`packages/domain/`) + GORM models + DB migrations
- Simulation engine: amortization, compounding, tax, monthly loop, PSLF tracker
- Echo API with JWT auth (register/login)
- Plan CRUD + income/expense/debt/investment CRUD
- `GET /plans/:id/simulate` → deterministic monthly snapshots

### Phase 2 — Frontend MVP (Weeks 4-6)
- React + Vite + TypeScript scaffold
- Plan editor forms (income, expenses, debts, investments, life events)
- Net worth projection chart (Recharts LineChart)
- Debt payoff schedule chart
- Life event timeline

### Phase 3 — Scenario Branching + Monte Carlo (Weeks 7-8)
- Fork API + delta inheritance in simulation engine
- Scenario tree UI (react-flow or custom SVG)
- Side-by-side comparison view
- Monte Carlo endpoint + D3.js fan chart

### Phase 4 — AI Agent (Weeks 9-10)
- MCP server in Go (`packages/ai/mcp_server.go`) exposing plan tools
- Gemini 2.0 Flash client with tool-calling loop (`packages/ai/agent.go`)
- `POST /ai/chat` endpoint with SSE streaming
- Frontend chat panel with tool call progress visualization
- Physician-domain system prompt

### Phase 5 — Polish + Export (Weeks 11-12)
- JSON export endpoint
- PSLF optimizer view + contribution optimizer
- Sankey cash flow diagram (D3.js)
- AI conversation history per plan
- Profile management, multi-plan organization

---

## Critical Files to Create

- `solomon/go.work`
- `solomon/docker-compose.yml` — postgres 16, api, frontend
- `solomon/Makefile`
- `solomon/packages/domain/*.go` — all entity types
- `solomon/packages/simulation/engine.go`
- `solomon/packages/simulation/amortization.go`
- `solomon/packages/simulation/monte_carlo.go`
- `solomon/packages/simulation/tax.go`
- `solomon/packages/simulation/pslf.go`
- `solomon/packages/ai/mcp_server.go`
- `solomon/packages/ai/agent.go`
- `solomon/packages/ai/gemini.go`
- `solomon/services/api/main.go`
- `solomon/services/api/handlers/ai_handler.go`
- `solomon/frontend/src/pages/Dashboard.tsx`
- `solomon/frontend/src/components/charts/`
- `solomon/frontend/src/components/chat/AIChatPanel.tsx`

---

## Verification

- `make dev` — starts PostgreSQL, API, and frontend dev server with `docker-compose`
- `POST /auth/register` + `POST /plans` + seed data → `GET /plans/:id/simulate` returns 360 monthly snapshots
- Fork a plan at month 36, change attending salary → re-simulate → net worth curves diverge at month 36
- Monte Carlo: 1000 runs complete in < 3 seconds for a 30-year horizon
- AI chat: "What if I have a kid in year 3?" → agent creates fork, adds childcare expense, runs simulation, returns comparison narrative
- Export: valid JSON schema, parseable by `jq`
