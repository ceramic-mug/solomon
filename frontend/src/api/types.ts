// Domain types mirroring the Go backend structs.
// Keep in sync with packages/domain/*.go

export interface User {
  id: string
  email: string
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  name: string
  state_code: string
  state_tax: number
}

export interface AssetAllocation {
  stock_pct: number
  bond_pct: number
  cash_pct: number
}

export interface SimulationConfig {
  id: string
  plan_id: string
  start_year: number
  start_month: number
  horizon_years: number
  inflation_rate: number
  monte_carlo_passes: number
  stock_mean_return: number
  stock_std_dev: number
  bond_mean_return: number
  bond_std_dev: number
}

export type IncomeType = 'salary' | 'bonus' | 'side_income' | 'investment' | 'rental' | 'other'
export type TaxCategory = 'w2' | 'self_employed' | 'passive' | 'capital_gains'

export interface IncomeStream {
  id: string
  plan_id: string
  name: string
  type: IncomeType
  tax_category: TaxCategory
  amount: number          // monthly gross
  growth_rate: number
  start_month: number
  end_month?: number
}

export type ExpenseCategory =
  | 'housing' | 'food' | 'transport' | 'healthcare' | 'insurance'
  | 'childcare' | 'education' | 'subscription' | 'utilities' | 'personal'
  | 'travel' | 'other'

export interface Expense {
  id: string
  plan_id: string
  name: string
  category: ExpenseCategory
  monthly_amount: number
  growth_rate: number
  start_month: number
  end_month?: number
  is_one_time: boolean
}

export type DebtType = 'student_loan' | 'mortgage' | 'auto' | 'credit_card' | 'personal' | 'other'
export type RepaymentPlan = 'standard' | 'idr' | 'paye' | 'save'

export interface DebtAccount {
  id: string
  plan_id: string
  name: string
  type: DebtType
  original_principal: number
  balance: number
  interest_rate: number
  min_payment: number
  extra_payment: number
  start_month: number
  repayment_plan: RepaymentPlan
  pslf_eligible: boolean
  pslf_payments_made: number
}

export type AccountType =
  | 'trad_401k' | 'roth_401k' | 'trad_457b'
  | 'trad_ira' | 'roth_ira' | 'hsa'
  | 'taxable' | '529' | 'cash'

export interface InvestmentAccount {
  id: string
  plan_id: string
  name: string
  type: AccountType
  balance: number
  monthly_contrib: number
  employer_match: number
  employer_match_cap: number
  asset_allocation: AssetAllocation
  start_month: number
}

export type GivingBasis = 'gross' | 'net'

export interface GivingTarget {
  id: string
  plan_id: string
  name: string
  basis: GivingBasis
  percentage: number
  fixed_amount?: number
  start_month: number
  end_month?: number
}

export type EventType = 'income_change' | 'expense_change' | 'one_time_expense' | 'milestone' | 'debt_payoff'

export interface EventImpact {
  id: string
  event_id: string
  target_type: 'income_stream' | 'expense' | 'debt' | 'investment'
  target_id: string
  field: string
  new_value: number
  operation: 'set' | 'add' | 'multiply'
}

export interface LifeEvent {
  id: string
  plan_id: string
  name: string
  type: EventType
  month: number
  impacts: EventImpact[]
}

export interface Plan {
  id: string
  profile_id: string
  parent_plan_id?: string
  fork_month?: number
  name: string
  description: string
  created_by_ai: boolean
  created_at: string
  updated_at: string
  simulation_config: SimulationConfig
  income_streams: IncomeStream[]
  expenses: Expense[]
  debt_accounts: DebtAccount[]
  investment_accounts: InvestmentAccount[]
  life_events: LifeEvent[]
  giving_targets: GivingTarget[]
}

// ---- Simulation Results ----

export interface MonthSnapshot {
  month: number
  year: number
  calendar_month: number
  gross_income: number
  taxes_paid: number
  net_income: number
  total_expenses: number
  total_debt_payments: number
  total_interest_paid: number
  total_giving: number
  total_invest_contrib: number
  cash_flow: number
  total_debt: number
  total_investments: number
  net_worth: number
  pslf_qualifying_payments?: number
}

export interface MonteCarloResult {
  passes: number
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
}

export interface SimulationResult {
  id: string
  plan_id: string
  monthly_snapshots: MonthSnapshot[]
  monte_carlo?: MonteCarloResult
}

export interface HorizonDelta {
  year: number
  plan_a_net_worth: number
  plan_b_net_worth: number
  delta: number
}

export interface PlanComparison {
  plan_a_id: string
  plan_b_id: string
  deltas: HorizonDelta[]
}

// ---- Auth ----

export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: User
}
