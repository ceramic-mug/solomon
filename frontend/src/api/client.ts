import axios from 'axios'
import type {
  AuthResponse, Plan, SimulationResult, PlanComparison,
  IncomeStream, Expense, DebtAccount, InvestmentAccount, LifeEvent, GivingTarget,
  SimulationConfig,
} from './types'

// Axios instance — all requests go through here.
// The Vite proxy routes /auth, /plans, /ai → localhost:8080 in dev.
const api = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
})

// Inject Authorization header for every request if a token exists.
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ---- Auth ----

export const register = (email: string, password: string, name: string, state_code = '', state_tax = 0) =>
  api.post<AuthResponse>('/auth/register', { email, password, name, state_code, state_tax }).then(r => r.data)

export const login = (email: string, password: string) =>
  api.post<AuthResponse>('/auth/login', { email, password }).then(r => r.data)

// ---- Plans ----

export const listPlans = () =>
  api.get<Plan[]>('/plans').then(r => r.data)

export const createPlan = (name: string, description: string, config?: Partial<SimulationConfig>) =>
  api.post<Plan>('/plans', { name, description, simulation_config: config }).then(r => r.data)

export const getPlan = (id: string) =>
  api.get<Plan>(`/plans/${id}`).then(r => r.data)

export const updatePlan = (id: string, data: Partial<Plan>) =>
  api.put<Plan>(`/plans/${id}`, data).then(r => r.data)

export const deletePlan = (id: string) =>
  api.delete(`/plans/${id}`)

export const forkPlan = (id: string, forkMonth: number, name: string, description = '') =>
  api.post<Plan>(`/plans/${id}/fork`, { fork_month: forkMonth, name, description }).then(r => r.data)

// ---- Simulation ----

export const simulate = (id: string, params?: { filing_status?: string; household_size?: number; state_tax?: number }) =>
  api.get<SimulationResult>(`/plans/${id}/simulate`, { params }).then(r => r.data)

export const simulateMonteCarlo = (id: string, params?: { filing_status?: string; household_size?: number; state_tax?: number }) =>
  api.get<SimulationResult>(`/plans/${id}/simulate/monte`, { params }).then(r => r.data)

export const comparePlans = (idA: string, idB: string) =>
  api.get<PlanComparison>(`/plans/${idA}/compare/${idB}`).then(r => r.data)

export const exportPlan = (id: string) =>
  api.get(`/plans/${id}/export`, { responseType: 'blob' }).then(r => r.data)

// ---- Income ----

export const createIncome = (planId: string, data: Omit<IncomeStream, 'id' | 'plan_id'>) =>
  api.post<IncomeStream>(`/plans/${planId}/income`, data).then(r => r.data)

export const updateIncome = (planId: string, id: string, data: IncomeStream) =>
  api.put<IncomeStream>(`/plans/${planId}/income/${id}`, data).then(r => r.data)

export const deleteIncome = (planId: string, id: string) =>
  api.delete(`/plans/${planId}/income/${id}`)

// ---- Expenses ----

export const createExpense = (planId: string, data: Omit<Expense, 'id' | 'plan_id'>) =>
  api.post<Expense>(`/plans/${planId}/expenses`, data).then(r => r.data)

export const updateExpense = (planId: string, id: string, data: Expense) =>
  api.put<Expense>(`/plans/${planId}/expenses/${id}`, data).then(r => r.data)

export const deleteExpense = (planId: string, id: string) =>
  api.delete(`/plans/${planId}/expenses/${id}`)

// ---- Debts ----

export const createDebt = (planId: string, data: Omit<DebtAccount, 'id' | 'plan_id'>) =>
  api.post<DebtAccount>(`/plans/${planId}/debts`, data).then(r => r.data)

export const updateDebt = (planId: string, id: string, data: DebtAccount) =>
  api.put<DebtAccount>(`/plans/${planId}/debts/${id}`, data).then(r => r.data)

export const deleteDebt = (planId: string, id: string) =>
  api.delete(`/plans/${planId}/debts/${id}`)

// ---- Investments ----

export const createInvestment = (planId: string, data: Omit<InvestmentAccount, 'id' | 'plan_id'>) =>
  api.post<InvestmentAccount>(`/plans/${planId}/investments`, data).then(r => r.data)

export const updateInvestment = (planId: string, id: string, data: InvestmentAccount) =>
  api.put<InvestmentAccount>(`/plans/${planId}/investments/${id}`, data).then(r => r.data)

export const deleteInvestment = (planId: string, id: string) =>
  api.delete(`/plans/${planId}/investments/${id}`)

// ---- Events ----

export const createEvent = (planId: string, data: Omit<LifeEvent, 'id' | 'plan_id'>) =>
  api.post<LifeEvent>(`/plans/${planId}/events`, data).then(r => r.data)

export const deleteEvent = (planId: string, id: string) =>
  api.delete(`/plans/${planId}/events/${id}`)

// ---- Giving ----

export const createGiving = (planId: string, data: Omit<GivingTarget, 'id' | 'plan_id'>) =>
  api.post<GivingTarget>(`/plans/${planId}/giving`, data).then(r => r.data)

export const deleteGiving = (planId: string, id: string) =>
  api.delete(`/plans/${planId}/giving/${id}`)
