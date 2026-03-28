import type { MonthSnapshot } from '../../api/types'

interface Props {
  snapshots: MonthSnapshot[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

interface YearRow {
  year: number
  grossIncome: number
  taxes: number
  netIncome: number
  avgExpenses: number
  debtService: number
  invested: number
  cashFlow: number
  totalDebt: number
  homeEquity: number
  netWorth: number
}

export default function AnnualSummaryTable({ snapshots }: Props) {
  if (!snapshots.length) return null

  // Group into chunks of 12 (one per year)
  const rows: YearRow[] = []
  for (let i = 0; i < snapshots.length; i += 12) {
    const group = snapshots.slice(i, i + 12)
    const last = group[group.length - 1]
    rows.push({
      year: last.year,
      grossIncome:  group.reduce((s, m) => s + m.gross_income, 0),
      taxes:        group.reduce((s, m) => s + m.taxes_paid, 0),
      netIncome:    group.reduce((s, m) => s + m.net_income, 0),
      avgExpenses:  group.reduce((s, m) => s + m.total_expenses, 0) / group.length,
      debtService:  group.reduce((s, m) => s + m.total_debt_payments, 0),
      invested:     group.reduce((s, m) => s + m.total_invest_contrib, 0),
      cashFlow:     group.reduce((s, m) => s + m.cash_flow, 0),
      totalDebt:    last.total_debt,
      homeEquity:   last.home_equity ?? 0,
      netWorth:     last.net_worth,
    })
  }

  const hasEquity = rows.some(r => r.homeEquity > 0)

  const cols = [
    { key: 'year',        label: 'Year',      align: 'left'  },
    { key: 'grossIncome', label: 'Gross Income (Annual)', align: 'right' },
    { key: 'taxes',       label: 'Taxes',     align: 'right' },
    { key: 'netIncome',   label: 'Net Income', align: 'right' },
    { key: 'avgExpenses', label: 'Avg Expenses/mo', align: 'right' },
    { key: 'debtService', label: 'Debt Service', align: 'right' },
    { key: 'invested',    label: 'Invested',  align: 'right' },
    { key: 'cashFlow',    label: 'Annual Cash Flow', align: 'right' },
    { key: 'totalDebt',   label: 'Total Debt', align: 'right' },
    ...(hasEquity ? [{ key: 'homeEquity', label: 'Home Equity', align: 'right' }] : []),
    { key: 'netWorth',    label: 'Net Worth', align: 'right' },
  ]

  function cell(key: string, row: YearRow): React.ReactNode {
    if (key === 'year') return <span className="font-mono text-gray-400">{row.year}</span>

    const v = row[key as keyof YearRow] as number
    if (key === 'cashFlow') {
      return <span className={v < 0 ? 'text-red-400' : 'text-emerald-400'}>{fmt(v)}</span>
    }
    if (key === 'netWorth') {
      return <span className={v < 0 ? 'text-red-400' : 'text-blue-400 font-semibold'}>{fmt(v)}</span>
    }
    if (key === 'totalDebt') {
      return <span className={v > 0 ? 'text-red-400' : 'text-emerald-400'}>{fmt(v)}</span>
    }
    if (key === 'homeEquity') {
      return <span className="text-amber-400">{fmt(v)}</span>
    }
    if (key === 'taxes') {
      return <span className="text-orange-400">{fmt(v)}</span>
    }
    return <span className="text-gray-300">{fmt(v)}</span>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-gray-900">
          <tr>
            {cols.map(c => (
              <th
                key={c.key}
                className={`px-3 py-2.5 font-medium text-gray-500 border-b border-gray-800 whitespace-nowrap ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.year}
              className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${
                i % 2 === 0 ? '' : 'bg-gray-800/20'
              }`}
            >
              {cols.map(c => (
                <td
                  key={c.key}
                  className={`px-3 py-2 whitespace-nowrap ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {cell(c.key, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
