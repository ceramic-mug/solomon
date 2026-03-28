# Solomon — Physician Financial Sandbox

Solomon is a financial modeling and simulation platform specifically designed for the complex financial trajectories of medical doctors. It combines a deterministic simulation engine with an agentic AI advisor to help physicians navigate residency, attending transitions, PSLF, and long-term wealth building.

## Core Features

- **Deterministic Simulation**: 30-year monthly cash flow and net worth projections.
- **Physician-Specific Logic**: 
  - Residency-to-attending income transitions.
  - Public Service Loan Forgiveness (PSLF) modeling.
  - IDR (Income-Driven Repayment) calculation.
  - Professional tax category handling (W2, 1099, Passive).
- **Agentic AI Advisor**: 
  - Natural language plan building ("I have $200k in med school debt at 6%").
  - Automated "What-if" scenario branching ("What if I have a kid in year 3?").
  - Narrative comparisons between different financial paths.
- **Interactive Visualizations**:
  - Net Worth projection charts with Monte Carlo probabilistic bands.
  - Cash Flow Reservoir: A dynamic systems-based visualization of income, taxes, and savings volume.
- **Plan Sandboxing**: Quickly copy and edit plan components (income, debt, investments) to see immediate impacts on your trajectory.

## Tech Stack

- **Backend**: Go (Monorepo)
  - `echo` for high-performance HTTP routing.
  - `gorm` with PostgreSQL for persistence.
  - `genai` for Gemini 2.0 Flash agentic reasoning.
- **Frontend**: React (TypeScript)
  - `vite` for fast development.
  - `tanstack-query` for robust server state management.
  - `zustand` for lightweight client state.
  - `tailwind-css` for modern, responsive styling.
- **Infrastructure**:
  - Docker Compose for reproducible development environments.
  - PostgreSQL 16 with pgvector (prepared for knowledge-base features).

## Getting Started

1. Ensure you have Docker and Docker Compose installed.
2. Place your Gemini API key in a file named `solomon_gemini_api.key` in the root directory.
3. Run the start script:
   ```bash
   ./start.sh
   ```
4. Access the application at `http://localhost:3000`.

## Project Structure

- `services/api`: Go API service and HTTP handlers.
- `packages/domain`: Core business logic and shared entities.
- `packages/simulation`: The deterministic math engine.
- `packages/infrastructure`: Database mappers and repository implementation.
- `packages/ai`: Gemini agent tool definitions and reasoning loop.
- `frontend/src`: React application, components, and state management.
