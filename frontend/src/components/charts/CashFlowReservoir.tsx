import React from 'react'
import type { MonthSnapshot } from '../../api/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(n))
}

export default function CashFlowReservoir({ snapshot }: { snapshot: MonthSnapshot }) {
  if (!snapshot) return <div className="p-4 text-gray-500">No snapshot data</div>

  // Magnitudes
  const gross = Math.max(1, snapshot.gross_income) // avoid div by 0
  const taxes = snapshot.taxes_paid
  const net = snapshot.net_income
  
  const expenses = snapshot.total_expenses
  const debt = snapshot.total_debt_payments
  const giving = snapshot.total_giving
  const invest = snapshot.total_invest_contrib
  const cashFlow = snapshot.cash_flow

  // Calculate widths based on a max width of 200px
  const scale = 240 / gross
  
  const wGross = gross * scale
  const wTaxes = taxes * scale
  const wNet = net * scale
  
  const wExp = expenses * scale
  const wDebt = debt * scale
  const wGive = giving * scale
  const wInv = invest * scale
  const wCash = cashFlow * scale

  return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800 font-mono text-[11px] select-none overflow-x-auto">
      <h3 className="text-gray-400 font-sans text-sm font-medium mb-6">Monthly Cash Flow Simulator</h3>
      
      <div className="flex items-start min-w-[600px]">
        {/* INFLOW */}
        <div className="flex flex-col items-end pr-4 border-r-2 border-blue-900/50 relative">
          <div className="mb-1 text-blue-400">GROSS INCOME</div>
          <div className="text-lg font-bold text-white mb-2">{fmt(gross)}</div>
          
          <div className="h-12 bg-blue-500/20 rounded-l-md border-y border-l border-blue-500/40 relative flex items-center justify-center overflow-hidden" style={{ width: Math.max(wGross, 4) }}>
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-blue-400/40 animate-pulse"></div>
          </div>
        </div>

        {/* DISTRIBUTOR */}
        <div className="flex-1 flex flex-col justify-center px-6 relative h-[250px]">
          {/* Main pipe across */}
          <div className="absolute left-0 top-[60px] h-12 bg-blue-500/10 border-y border-blue-500/20 w-full z-0"></div>
          
          <div className="relative z-10 flex flex-col gap-6 mt-8">
            
            {/* Taxes */}
            <div className="flex items-center gap-3">
              <div className="w-16 h-[2px] bg-red-500/50 relative">
                <div className="absolute right-0 -top-1 w-2 h-2 rounded-full bg-red-500"></div>
              </div>
              <div className="bg-red-950/40 border border-red-900/50 rounded p-2 min-w-[120px]">
                <div className="text-red-400">TAXES</div>
                <div className="text-white text-sm">{fmt(taxes)}</div>
              </div>
            </div>

            {/* Expenses */}
            <div className="flex items-center gap-3">
              <div className="w-16 h-[2px] bg-orange-500/50 relative">
                <div className="absolute right-0 -top-1 w-2 h-2 rounded-full bg-orange-500"></div>
              </div>
              <div className="bg-orange-950/40 border border-orange-900/50 rounded p-2 min-w-[120px]">
                <div className="text-orange-400">EXPENSES</div>
                <div className="text-white text-sm">{fmt(expenses)}</div>
              </div>
            </div>

            {/* Debt */}
            <div className="flex items-center gap-3">
              <div className="w-16 h-[2px] bg-purple-500/50 relative">
                <div className="absolute right-0 -top-1 w-2 h-2 rounded-full bg-purple-500"></div>
              </div>
              <div className="bg-purple-950/40 border border-purple-900/50 rounded p-2 min-w-[120px]">
                <div className="text-purple-400">DEBT PAYMENTS</div>
                <div className="text-white text-sm">{fmt(debt)}</div>
              </div>
            </div>

          </div>
        </div>

        {/* RESERVOIR (Investments & Cash) */}
        <div className="flex flex-col items-start pl-4 border-l-2 border-blue-900/50 relative">
          <div className="mb-8 relative mt-[40px]">
            <div className="mb-1 text-emerald-400">INVESTMENTS</div>
            <div className="text-lg font-bold text-white mb-2">{fmt(invest)}</div>
            <div className="h-16 bg-emerald-500/20 rounded-r-md border-y border-r border-emerald-500/40 relative overflow-hidden" style={{ width: Math.max(wInv, 40) }}>
              <div className="absolute bottom-0 w-full bg-emerald-500/30" style={{ height: `${Math.min(100, (invest/net)*100)}%` }}></div>
            </div>
            <div className="text-xs text-gray-500 mt-2">Total: {fmt(snapshot.total_investments)}</div>
          </div>

          <div className="relative">
            <div className="mb-1 text-blue-300">FREE CASH FLOW</div>
            <div className="text-lg font-bold text-white mb-2">{fmt(cashFlow)}</div>
            <div className="h-10 bg-blue-400/20 rounded-r-md border-y border-r border-blue-400/40 relative overflow-hidden" style={{ width: Math.max(wCash, 20) }}>
               <div className="absolute bottom-0 w-full bg-blue-400/30 h-full"></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
