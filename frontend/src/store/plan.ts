import { create } from 'zustand'
import type { Plan, SimulationResult } from '../api/types'

interface PlanState {
  activePlanId: string | null
  plans: Plan[]
  simulationResults: Record<string, SimulationResult>
  setActivePlan: (id: string) => void
  setPlans: (plans: Plan[]) => void
  upsertPlan: (plan: Plan) => void
  removePlan: (id: string) => void
  setSimulationResult: (planId: string, result: SimulationResult) => void
}

export const usePlanStore = create<PlanState>((set) => ({
  activePlanId: null,
  plans: [],
  simulationResults: {},
  setActivePlan: (id) => set({ activePlanId: id }),
  setPlans: (plans) => set({ plans }),
  upsertPlan: (plan) => set((s) => {
    const existing = s.plans.findIndex(p => p.id === plan.id)
    if (existing >= 0) {
      const updated = [...s.plans]
      updated[existing] = plan
      return { plans: updated }
    }
    return { plans: [...s.plans, plan] }
  }),
  removePlan: (id) => set((s) => ({ plans: s.plans.filter(p => p.id !== id) })),
  setSimulationResult: (planId, result) =>
    set((s) => ({ simulationResults: { ...s.simulationResults, [planId]: result } })),
}))
