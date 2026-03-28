# Solomon — Technical Documentation

## Architecture Deep Dive

### Simulation Engine (`/packages/simulation`)
The core math engine is a deterministic, month-by-month projection. It applies:
1. **Income Resolution**: Active streams are filtered and summed.
2. **Tax Application**: Progressive income tax, FICA, and state tax.
3. **Debt Service**: Amortization of debts (standard, IDR, SAVE).
4. **Expense Calculation**: Summing active monthly expenses.
5. **Net Cash Flow**: Gross - Tax - Expenses - Debt - Giving.
6. **Investment Logic**: Asset allocation and compounding returns.

### AI Agent Loop (`/services/api/handlers/ai_handler.go`)
The AI agent uses **Gemini 2.0 Flash** with function calling. 
1. The user's query is sent to Gemini with tool definitions and a system prompt describing the physician's context.
2. Gemini issues tool calls (e.g., `create_fork`, `add_income`).
3. The API executes these calls against the PostgreSQL repository.
4. Tool results are fed back to Gemini until a final narrative is generated.
5. Results are streamed to the client via **Server-Sent Events (SSE)**.

## Technical Debt & Bug Backlog

### Identified Bugs
- **Cash Flow Reservoir Visuals**: If cash flow or income is negative, some UI elements may behave unexpectedly due to scale calculations.
- **SSE Stream Handling in SimpleAgent**: Currently, `SimpleAgent` waits for the entire stream to finish without showing real-time progress. It should implement an SSE listener like `AIChat.tsx`.
- **Absolute vs Relative Imports**: Some frontend components have inconsistent import paths (`../../` vs absolute paths configured in `tsconfig.json`).
- **Input Validation**: Backend `Bind` doesn't enforce all validation tags on sub-entity creation.

### Future Development Steps

#### Phase 1: Enhanced PSLF Modeling
- Build a dedicated PSLF view to track qualifying payments.
- Add "Employer Search" to verify nonprofit/government status.
- Add a "SAVE vs PAYE" comparison tool.

#### Phase 2: Knowledge Base & RAG
- Index the **White Coat Investor** or similar physician-specific financial resources.
- Use `pgvector` to perform semantic searches and feed context to the AI agent.

#### Phase 3: Advanced Visualizations
- **Sankey Diagram**: A full-page visualization of how every dollar moves through the plan.
- **Probabilistic Fan Charts**: Integrate the existing Monte Carlo logic into more frontend views.

#### Phase 4: Collaborative Planning
- Allow "Share" links for plans (read-only or collaborative).
- Export to PDF or formatted Excel summaries.
