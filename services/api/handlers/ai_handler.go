package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"google.golang.org/api/option"

	mw "github.com/solomon/api/middleware"
	"github.com/solomon/domain"
	"github.com/solomon/infrastructure/postgres"
	"github.com/solomon/simulation"
)

// ---- SSE event types ----

type sseEventType string

const (
	evtToolCall   sseEventType = "tool_call"
	evtToolResult sseEventType = "tool_result"
	evtMessage    sseEventType = "message"
	evtDone       sseEventType = "done"
)

type sseEvent struct {
	Type   sseEventType           `json:"type"`
	Tool   string                 `json:"tool,omitempty"`
	Params map[string]interface{} `json:"params,omitempty"`
	Result interface{}            `json:"result,omitempty"`
	Text   string                 `json:"text,omitempty"`
}

// ---- Handler ----

type AIHandler struct {
	repo   *postgres.Repository
	apiKey string
}

func NewAIHandler(repo *postgres.Repository, geminiAPIKey string) *AIHandler {
	return &AIHandler{repo: repo, apiKey: geminiAPIKey}
}

type chatRequest struct {
	PlanID  string `json:"plan_id"`
	Message string `json:"message"`
}

// StateTax handles GET /ai/state-tax?state=XX — returns the current flat
// state income tax rate for the given 2-letter state code.
// This endpoint is public (no auth) so it can be called during registration.
func (h *AIHandler) StateTax(c echo.Context) error {
	stateCode := c.QueryParam("state")
	if len(stateCode) != 2 {
		return echo.NewHTTPError(http.StatusBadRequest, "state must be a 2-letter code")
	}

	if h.apiKey == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "AI not configured")
	}

	ctx := c.Request().Context()
	client, err := genai.NewClient(ctx, option.WithAPIKey(h.apiKey))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "AI client error")
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-3-flash-preview")
	prompt := fmt.Sprintf(
		`What is the current (2026) state income tax rate for %s (US state code)?
Return ONLY a JSON object in this exact format with no other text:
{"rate": <flat_rate_as_percentage_float>}

Rules:
- For states with no income tax (TX, FL, NV, WA, WY, SD, AK, TN, NH), return {"rate": 0}
- For states with flat rates, return that rate
- For states with graduated brackets, return the top marginal rate
- rate is a percentage (e.g. 5.0 means 5%%, not 0.05)`, stateCode)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil || len(resp.Candidates) == 0 {
		return echo.NewHTTPError(http.StatusInternalServerError, "AI lookup failed")
	}

	var raw string
	for _, part := range resp.Candidates[0].Content.Parts {
		if t, ok := part.(genai.Text); ok {
			raw += string(t)
		}
	}

	// Strip markdown fences if Gemini wraps the JSON
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var result struct {
		Rate float64 `json:"rate"`
	}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not parse AI response")
	}

	return c.JSON(http.StatusOK, result)
}

// Chat handles POST /ai/chat — streams SSE events back to the client.
func (h *AIHandler) Chat(c echo.Context) error {
	var req chatRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.PlanID == "" || req.Message == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "plan_id and message are required")
	}

	planID, err := uuid.Parse(req.PlanID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid plan_id")
	}

	claims := mw.GetClaims(c)
	plan, err := h.repo.GetPlan(c.Request().Context(), planID)
	if err != nil || plan.ProfileID != claims.ProfileID {
		return echo.NewHTTPError(http.StatusNotFound, "plan not found")
	}

	// Set SSE headers
	w := c.Response()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	ctx := c.Request().Context()
	emit := func(evt sseEvent) {
		data, _ := json.Marshal(evt)
		fmt.Fprintf(w, "data: %s\n\n", data)
		w.Flush()
	}

	if err := h.runAgent(ctx, plan, claims.ProfileID, req.Message, emit); err != nil {
		emit(sseEvent{Type: evtMessage, Text: fmt.Sprintf("Error: %s", err.Error())})
	}
	emit(sseEvent{Type: evtDone})
	return nil
}

// ---- Gemini agent loop ----

func (h *AIHandler) runAgent(
	ctx context.Context,
	plan domain.Plan,
	profileID uuid.UUID,
	message string,
	emit func(sseEvent),
) error {
	client, err := genai.NewClient(ctx, option.WithAPIKey(h.apiKey))
	if err != nil {
		return fmt.Errorf("create gemini client: %w", err)
	}
	defer client.Close()

	planJSON, _ := json.MarshalIndent(plan, "", "  ")

	model := client.GenerativeModel("gemini-3-flash-preview")
	model.Tools = []*genai.Tool{solomonToolDefs()}
	model.SystemInstruction = &genai.Content{
		Parts: []genai.Part{genai.Text(buildSystemPrompt(string(planJSON)))},
	}

	chat := model.StartChat()

	resp, err := chat.SendMessage(ctx, genai.Text(message))
	if err != nil {
		return fmt.Errorf("send message: %w", err)
	}

	// Agentic loop — continue until no more function calls
	for {
		var toolCalls []*genai.FunctionCall
		var textAccum string

		for _, cand := range resp.Candidates {
			if cand.Content == nil {
				continue
			}
			for _, part := range cand.Content.Parts {
				switch p := part.(type) {
				case genai.Text:
					textAccum += string(p)
				case genai.FunctionCall:
					c := p
					toolCalls = append(toolCalls, &c)
				}
			}
		}

		if textAccum != "" {
			emit(sseEvent{Type: evtMessage, Text: textAccum})
		}

		if len(toolCalls) == 0 {
			return nil
		}

		// Execute tools and collect responses
		var funcParts []genai.Part
		for _, call := range toolCalls {
			emit(sseEvent{Type: evtToolCall, Tool: call.Name, Params: call.Args})

			result, execErr := h.executeTool(ctx, plan.ID, profileID, call.Name, call.Args)
			if execErr != nil {
				result = map[string]string{"error": execErr.Error()}
			}

			emit(sseEvent{Type: evtToolResult, Tool: call.Name, Result: result})

			funcParts = append(funcParts, genai.FunctionResponse{
				Name:     call.Name,
				Response: map[string]interface{}{"result": result},
			})
		}

		resp, err = chat.SendMessage(ctx, funcParts...)
		if err != nil {
			return fmt.Errorf("send tool results: %w", err)
		}
	}
}

// ---- Tool execution ----

func (h *AIHandler) executeTool(
	ctx context.Context,
	planID uuid.UUID,
	profileID uuid.UUID,
	name string,
	args map[string]interface{},
) (interface{}, error) {
	switch name {
	case "get_plan":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		plan, err := h.repo.GetPlan(ctx, id)
		if err != nil {
			return nil, err
		}
		return plan, nil

	case "list_plans":
		return h.repo.ListPlansByProfile(ctx, profileID)

	case "get_simulation":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		plan, err := h.repo.GetPlan(ctx, id)
		if err != nil {
			return nil, err
		}
		result := simulation.Run(plan, simulation.RunOptions{
			FilingStatus:  simulation.FilingStatusMarriedFilingJointly,
			HouseholdSize: 2,
		})
		return result, nil

	case "run_simulation":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		plan, err := h.repo.GetPlan(ctx, id)
		if err != nil {
			return nil, err
		}
		opts := simulation.RunOptions{
			FilingStatus:  simulation.FilingStatusMarriedFilingJointly,
			HouseholdSize: 2,
		}
		if mc, ok := args["monte_carlo"].(bool); ok && mc {
			opts.RunMonteCarlo = true
		}
		result := simulation.Run(plan, opts)
		return result, nil

	case "compare_plans":
		idA, idB := planID, planID
		if s, ok := args["plan_a_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				idA = p
			}
		}
		if s, ok := args["plan_b_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				idB = p
			}
		}
		planA, err := h.repo.GetPlan(ctx, idA)
		if err != nil {
			return nil, err
		}
		planB, err := h.repo.GetPlan(ctx, idB)
		if err != nil {
			return nil, err
		}
		opts := simulation.RunOptions{FilingStatus: simulation.FilingStatusMarriedFilingJointly, HouseholdSize: 2}
		resultA := simulation.Run(planA, opts)
		resultB := simulation.Run(planB, opts)
		resultA.PlanID = planA.ID
		resultB.PlanID = planB.ID
		return simulation.ComparePlans(resultA, resultB, []int{1, 5, 10, 20, 30}), nil

	case "create_fork":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		forkMonth := int(getFloat(args, "fork_month"))
		forkName := getString(args, "name")
		if forkName == "" {
			forkName = "AI Fork"
		}
		desc := getString(args, "description")
		fork, err := h.repo.ForkPlan(ctx, id, forkMonth, forkName, desc, true)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"id":          fork.ID,
			"name":        fork.Name,
			"description": fork.Description,
			"message":     "Fork created successfully. You can now use get_plan or get_simulation on this new plan ID if you need more details.",
		}, nil

	case "add_life_event":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		ev := domain.LifeEvent{
			ID:      uuid.New(),
			PlanID:  id,
			Name:    getString(args, "name"),
			Type:    domain.EventType(getString(args, "type")),
			Month:   int(getFloat(args, "month")),
			Impacts: []domain.EventImpact{},
		}
		created, err := h.repo.CreateLifeEvent(ctx, ev)
		if err != nil {
			return nil, err
		}
		return created, nil

	case "add_expense":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		exp := domain.Expense{
			ID:            uuid.New(),
			PlanID:        id,
			Name:          getString(args, "name"),
			Category:      domain.ExpenseCategory(getString(args, "category")),
			MonthlyAmount: getFloat(args, "monthly_amount"),
			GrowthRate:    getFloat(args, "growth_rate"),
			StartMonth:    int(getFloat(args, "start_month")),
		}
		if em, ok := args["end_month"].(float64); ok {
			n := int(em)
			exp.EndMonth = &n
		}
		created, err := h.repo.CreateExpense(ctx, exp)
		if err != nil {
			return nil, err
		}
		return created, nil

	case "add_debt":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		principal := getFloat(args, "principal")
		appreciationRate := getFloat(args, "appreciation_rate")
		if appreciationRate == 0 {
			appreciationRate = 0.03
		}
		debt := domain.DebtAccount{
			ID:                uuid.New(),
			PlanID:            id,
			Name:              getString(args, "name"),
			Type:              domain.DebtType(getString(args, "type")),
			OriginalPrincipal: principal,
			Balance:           principal,
			InterestRate:      getFloat(args, "interest_rate") / 100,
			MinPayment:        getFloat(args, "min_payment"),
			ExtraPayment:      getFloat(args, "extra_payment"),
			StartMonth:        int(getFloat(args, "start_month")),
			RepaymentPlan:     domain.RepaymentPlan(getString(args, "repayment_plan")),
			PSLFEligible:      getBool(args, "pslf_eligible"),
			PSLFPaymentsMade:  int(getFloat(args, "pslf_payments_made")),
			PropertyValue:     getFloat(args, "property_value"),
			AppreciationRate:  appreciationRate,
		}
		created, err := h.repo.CreateDebt(ctx, debt)
		if err != nil {
			return nil, err
		}
		return created, nil

	case "add_investment":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		stockPct := getFloat(args, "stock_pct")
		if stockPct == 0 {
			stockPct = 0.9
		}
		bondPct := getFloat(args, "bond_pct")
		if bondPct == 0 {
			bondPct = 0.1
		}
		inv := domain.InvestmentAccount{
			ID:             uuid.New(),
			PlanID:         id,
			Name:           getString(args, "name"),
			Type:           domain.AccountType(getString(args, "type")),
			Balance:        getFloat(args, "balance"),
			MonthlyContrib: getFloat(args, "monthly_contrib"),
			EmployerMatch:  getFloat(args, "employer_match") / 100,
			StartMonth:     int(getFloat(args, "start_month")),
			GoalTarget:     getFloat(args, "goal_target"),
			GoalLabel:      getString(args, "goal_label"),
			AssetAllocation: domain.AssetAllocation{
				StockPct: stockPct,
				BondPct:  bondPct,
				CashPct:  1.0 - stockPct - bondPct,
			},
		}
		created, err := h.repo.CreateInvestment(ctx, inv)
		if err != nil {
			return nil, err
		}
		return created, nil

	case "add_income":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		inc := domain.IncomeStream{
			ID:          uuid.New(),
			PlanID:      id,
			Name:        getString(args, "name"),
			Type:        domain.IncomeType(getString(args, "type")),
			Amount:      getFloat(args, "amount"),
			GrowthRate:  getFloat(args, "growth_rate"),
			StartMonth:  int(getFloat(args, "start_month")),
			TaxCategory: domain.TaxCategory(getString(args, "tax_category")),
		}
		if em, ok := args["end_month"].(float64); ok {
			n := int(em)
			inc.EndMonth = &n
		}
		created, err := h.repo.CreateIncomeStream(ctx, inc)
		if err != nil {
			return nil, err
		}
		return created, nil

	case "modify_income":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		streamIDStr := getString(args, "stream_id")
		streamID, err := uuid.Parse(streamIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid stream_id")
		}
		p, err := h.repo.GetPlan(ctx, id)
		if err != nil {
			return nil, err
		}
		field := getString(args, "field")
		newValue := getFloat(args, "new_value")
		for i, s := range p.IncomeStreams {
			if s.ID == streamID {
				switch field {
				case "amount":
					p.IncomeStreams[i].Amount = newValue
				case "growth_rate":
					p.IncomeStreams[i].GrowthRate = newValue / 100
				case "start_month":
					p.IncomeStreams[i].StartMonth = int(newValue)
				}
				if err := h.repo.UpdateIncomeStream(ctx, p.IncomeStreams[i]); err != nil {
					return nil, err
				}
				return p.IncomeStreams[i], nil
			}
		}
		return nil, fmt.Errorf("income stream not found")

	case "add_giving":
		id := planID
		if s, ok := args["plan_id"].(string); ok {
			if p, err := uuid.Parse(s); err == nil {
				id = p
			}
		}
		basis := domain.GivingBasis(getString(args, "basis"))
		if basis == "" {
			basis = domain.GivingBasisGross
		}
		g := domain.GivingTarget{
			ID:         uuid.New(),
			PlanID:     id,
			Name:       getString(args, "name"),
			Basis:      basis,
			Percentage: getFloat(args, "percentage"),
			StartMonth: int(getFloat(args, "start_month")),
		}
		if fa, ok := args["fixed_amount"].(float64); ok && fa > 0 {
			g.FixedAmount = &fa
		}
		if em, ok := args["end_month"].(float64); ok {
			n := int(em)
			g.EndMonth = &n
		}
		created, err := h.repo.CreateGivingTarget(ctx, g)
		if err != nil {
			return nil, err
		}
		return created, nil

	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// ---- Arg helpers ----

func getString(args map[string]interface{}, key string) string {
	if v, ok := args[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getFloat(args map[string]interface{}, key string) float64 {
	if v, ok := args[key]; ok {
		if f, ok := v.(float64); ok {
			return f
		}
	}
	return 0
}

func getBool(args map[string]interface{}, key string) bool {
	if v, ok := args[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

// ---- Tool definitions ----

func solomonToolDefs() *genai.Tool {
	str := func(desc string) *genai.Schema { return &genai.Schema{Type: genai.TypeString, Description: desc} }
	num := func(desc string) *genai.Schema { return &genai.Schema{Type: genai.TypeNumber, Description: desc} }
	boo := func(desc string) *genai.Schema { return &genai.Schema{Type: genai.TypeBoolean, Description: desc} }

	return &genai.Tool{
		FunctionDeclarations: []*genai.FunctionDeclaration{
			{
				Name:        "get_plan",
				Description: "Fetch the full plan data including all income, expenses, debts, investments, and events.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id": str("UUID of the plan to fetch (leave blank to use current plan)"),
					},
				},
			},
			{
				Name:        "list_plans",
				Description: "List all plans belonging to the user.",
				Parameters:  &genai.Schema{Type: genai.TypeObject, Properties: map[string]*genai.Schema{}},
			},
			{
				Name:        "get_simulation",
				Description: "Run and return the deterministic simulation for a plan — monthly snapshots of net worth, income, debt, and investments over 30 years.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id": str("UUID of the plan to simulate"),
					},
				},
			},
			{
				Name:        "run_simulation",
				Description: "Run simulation for a plan. Set monte_carlo=true for probabilistic bands.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":      str("UUID of the plan"),
						"monte_carlo":  boo("Whether to run Monte Carlo simulation (1000 passes)"),
					},
				},
			},
			{
				Name:        "compare_plans",
				Description: "Compare two plans side by side — returns net worth deltas at 1, 5, 10, 20, and 30 year horizons.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_a_id": str("UUID of the base plan"),
						"plan_b_id": str("UUID of the comparison plan"),
					},
					Required: []string{"plan_a_id", "plan_b_id"},
				},
			},
			{
				Name:        "create_fork",
				Description: "Fork (branch) a plan at a given month. The fork inherits all data from the parent but can be modified independently.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":     str("UUID of the plan to fork"),
						"fork_month":  num("Month index (0 = plan start) where the fork diverges"),
						"name":        str("Name for the new fork"),
						"description": str("Short description of this scenario"),
					},
					Required: []string{"fork_month", "name"},
				},
			},
			{
				Name:        "optimize_plan",
				Description: "Iteratively solve for a target goal (e.g. net worth at retirement) by adjusting a specific variable (e.g. monthly contribution). Creates a new fork with the optimized value.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":      str("UUID of the plan"),
						"goal_type":     str("Type of goal: 'net_worth_at_month'"),
						"target_value":  num("The dollar amount target (e.g. 2000000 for $2M)"),
						"target_month":  num("The month index when the target should be reached"),
						"adjust_field":  str("Field to adjust: 'monthly_contrib'"),
						"target_id":     str("UUID of the account/income to adjust"),
					},
					Required: []string{"goal_type", "target_value", "target_month", "adjust_field", "target_id"},
				},
			},
			{
				Name:        "add_life_event",
				Description: "Add a life event milestone (e.g. 'Child Born', 'Start Attending', 'Buy House') to a plan.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id": str("UUID of the plan"),
						"name":    str("Event name, e.g. 'Child Born'"),
						"type":    str("Event type: milestone, income_change, expense_change, one_time_expense, debt_payoff"),
						"month":   num("Month index when this event occurs (0 = plan start)"),
					},
					Required: []string{"name", "type", "month"},
				},
			},
			{
				Name:        "add_expense",
				Description: "Add a recurring or one-time expense to a plan.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":        str("UUID of the plan"),
						"name":           str("Expense name"),
						"category":       str("Category: housing, food, transport, healthcare, insurance, childcare, education, subscription, utilities, personal, travel, other"),
						"monthly_amount": num("Monthly cost in dollars"),
						"start_month":    num("Month index when this expense starts"),
						"end_month":      num("Month index when expense ends (omit for indefinite)"),
						"growth_rate":    num("Annual growth rate as decimal (e.g. 0.03 for 3%)"),
					},
					Required: []string{"name", "category", "monthly_amount", "start_month"},
				},
			},
			{
				Name:        "add_debt",
				Description: "Add a debt account (student loan, mortgage, auto, etc.) to a plan. For mortgages, always set property_value so home equity is tracked correctly.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":            str("UUID of the plan"),
						"name":               str("Debt name"),
						"type":               str("Debt type: student_loan, mortgage, auto, credit_card, personal, other"),
						"principal":          num("Original loan balance in dollars (for mortgages: the loan amount, not the home price)"),
						"interest_rate":      num("Annual interest rate as percentage (e.g. 6.5 for 6.5%)"),
						"min_payment":        num("Minimum monthly payment (0 for auto-calculated)"),
						"extra_payment":      num("Extra monthly payment beyond minimum"),
						"start_month":        num("Month index when repayment starts"),
						"repayment_plan":     str("Repayment plan: standard, idr, paye, save, ibr_new"),
						"pslf_eligible":      boo("Whether this loan qualifies for PSLF"),
						"pslf_payments_made": num("Number of PSLF qualifying payments already made (0-120)"),
						"property_value":     num("MORTGAGE ONLY: current estimated market value of the property in dollars (e.g. 500000). Required for home equity tracking."),
						"appreciation_rate":  num("MORTGAGE ONLY: annual property appreciation rate as decimal (e.g. 0.03 for 3%). Defaults to 0.03 if omitted."),
					},
					Required: []string{"name", "type", "principal", "interest_rate"},
				},
			},
			{
				Name:        "add_investment",
				Description: "Add an investment or savings account to a plan. Use type 'savings' or 'money_market' for emergency funds, down payment accounts, or any named savings goal. Use retirement/brokerage types for investment accounts.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":        str("UUID of the plan"),
						"name":           str("Account name"),
						"type":           str("Account type: trad_401k, roth_401k, trad_457b, trad_ira, roth_ira, hsa, taxable, 529, cash, savings, money_market"),
						"balance":        num("Current balance in dollars"),
						"monthly_contrib": num("Monthly contribution in dollars"),
						"employer_match": num("Employer match as percentage of salary (e.g. 4 for 4%)"),
						"stock_pct":      num("Stock allocation as decimal (e.g. 0.9 for 90%). Use 0 for savings/cash accounts."),
						"bond_pct":       num("Bond allocation as decimal (e.g. 0.1 for 10%). Use 0 for savings/cash accounts."),
						"start_month":    num("Month index when account starts"),
						"goal_target":    num("Savings goal target balance in dollars (optional, 0 = no goal). Set this for named goals like emergency fund, down payment, college fund."),
						"goal_label":     str("Savings goal label shown in dashboard (optional), e.g. 'Emergency Fund', 'Down Payment', 'College - Emma'"),
					},
					Required: []string{"name", "type", "monthly_contrib"},
				},
			},
			{
				Name:        "add_income",
				Description: "Add a recurring income stream (e.g. residency salary, attending bonus) to a plan.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":      str("UUID of the plan"),
						"name":         str("Income name, e.g. 'Residency Salary'"),
						"type":         str("Income type: salary, bonus, side_income, investment, rental, other"),
						"tax_category": str("Tax category: w2, self_employed, passive, capital_gains"),
						"amount":       num("Monthly gross amount in dollars"),
						"growth_rate":  num("Annual growth rate as decimal (e.g. 0.03 for 3%)"),
						"start_month":  num("Month index when this income starts"),
						"end_month":    num("Month index when income ends (omit for indefinite)"),
					},
					Required: []string{"name", "type", "tax_category", "amount", "start_month"},
				},
			},
			{
				Name:        "modify_income",
				Description: "Modify a field on an existing income stream (e.g. change salary amount when transitioning from resident to attending).",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":   str("UUID of the plan"),
						"stream_id": str("UUID of the income stream to modify"),
						"field":     str("Field to change: amount, growth_rate, start_month"),
						"new_value": num("New value for the field"),
					},
					Required: []string{"stream_id", "field", "new_value"},
				},
			},
			{
				Name:        "add_giving",
				Description: "Add a charitable giving commitment (tithe, donation, church giving, charity pledge, etc.) to a plan. ALWAYS use this tool for giving — never use add_expense for charitable giving.",
				Parameters: &genai.Schema{
					Type: genai.TypeObject,
					Properties: map[string]*genai.Schema{
						"plan_id":      str("UUID of the plan"),
						"name":         str("Giving name, e.g. 'Church Tithe', 'Local Charity', 'Donor-Advised Fund'"),
						"basis":        str("Income basis: 'gross' (pre-tax) or 'net' (post-tax). Default: gross"),
						"percentage":   num("Giving as a fraction of income (e.g. 0.10 for 10%). Use this OR fixed_amount."),
						"fixed_amount": num("Fixed monthly dollar amount (optional, overrides percentage if set)"),
						"start_month":  num("Month index when giving starts (0 = plan start)"),
						"end_month":    num("Month index when giving ends (omit for indefinite)"),
					},
					Required: []string{"name", "start_month"},
				},
			},
		},
	}
}

// ---- System prompt ----

func buildSystemPrompt(planJSON string) string {
	return `You are Solomon, an AI financial advisor embedded in a physician financial planning application.

You help physicians model complex financial scenarios using tool calls. You have access to tools that can:
- Fetch and simulate financial plans
- Fork plans into alternative scenarios ("what if" branches)
- Add expenses, debts, investment accounts, income streams, giving targets, and life events
- Compare plans side by side with net worth deltas

## CRITICAL: Tool Classification Rules
- Giving / charitable giving / tithes / donations / church giving / charity / pledges → ALWAYS use add_giving. NEVER use add_expense for these.
- Regular living expenses (housing, food, transport, healthcare, etc.) → use add_expense.
- When in doubt whether something is "giving", ask yourself: is it charitable? If yes, use add_giving.
- Emergency funds, down payment savings, college funds, vacation funds, or any named savings goal → use add_investment with type "savings" or "money_market", and set goal_target + goal_label so it appears in the Goals tracker.

## Current Plan Data
` + "```json\n" + planJSON + "\n```" + `

## Physician Financial Context

**Residency → Attending transition**: Residents earn ~$60-90k/yr; attendings earn $200-600k+ depending on specialty.

**PSLF (Public Service Loan Forgiveness)**:
- 120 qualifying payments while working for a nonprofit/government employer
- Must be on IDR (Income-Driven Repayment) plan
- Any remaining balance forgiven tax-free after 120 payments
- Only makes sense if loan balance is high relative to income

**2026 IRS Contribution Limits**:
- 401(k)/403(b)/457(b): $23,500/yr
- IRA (Traditional + Roth): $7,000/yr
- HSA (family): $8,750/yr

**Optimal contribution sequence**: 401k to match → HSA max → 401k max → backdoor Roth IRA → 457b → taxable

**Month indexing**: Month 0 = plan start date. If the plan starts in July 2026 and the user says "year 3 of residency", that's approximately month 24-36.

## Instructions

1. When asked a "what if" question, create a fork of the current plan using create_fork
2. Add appropriate expenses, events, and modifications to the fork
3. Run the simulation on both plans
4. Compare them with compare_plans
5. Return a clear, concise narrative with specific dollar figures at 5, 10, and 20+ year horizons

Always:
- Confirm before making changes to the BASE plan (forks are safe to modify freely)
- Label AI-generated forks clearly in the name
- Surface specific numbers: net worth delta, monthly cash flow impact, break-even years
- Flag PSLF implications whenever student loans are involved
- Keep responses focused and physician-relevant`
}
