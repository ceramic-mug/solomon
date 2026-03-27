package domain

import "github.com/google/uuid"

// AccountType classifies a tax-advantaged or taxable investment account.
type AccountType string

const (
	AccountTypeTrad401k  AccountType = "trad_401k"  // Traditional 401(k) / 403(b) — pre-tax, employer plan
	AccountTypeRoth401k  AccountType = "roth_401k"  // Roth 401(k) — post-tax, employer plan
	AccountTypeTrad457b  AccountType = "trad_457b"  // 457(b) — deferred comp, no early withdrawal penalty
	AccountTypeTradIRA   AccountType = "trad_ira"   // Traditional IRA — pre-tax (deductibility limits apply)
	AccountTypeRothIRA   AccountType = "roth_ira"   // Roth IRA (direct or via backdoor)
	AccountTypeHSA       AccountType = "hsa"        // Health Savings Account — triple tax advantage
	AccountTypeTaxable   AccountType = "taxable"    // Standard brokerage account
	AccountType529       AccountType = "529"         // 529 education savings
	AccountTypeCash      AccountType = "cash"        // Emergency fund / HYSA
)

// AssetAllocation defines the portfolio split across asset classes.
// All values are fractions that must sum to 1.0.
type AssetAllocation struct {
	StockPct float64 `json:"stock_pct"` // e.g. 0.90
	BondPct  float64 `json:"bond_pct"`  // e.g. 0.08
	CashPct  float64 `json:"cash_pct"`  // e.g. 0.02
}

// InvestmentAccount represents a single investment or savings account.
type InvestmentAccount struct {
	ID               uuid.UUID       `json:"id"`
	PlanID           uuid.UUID       `json:"plan_id"`
	Name             string          `json:"name"`
	Type             AccountType     `json:"type"`
	Balance          float64         `json:"balance"`           // starting balance at plan start
	MonthlyContrib   float64         `json:"monthly_contrib"`   // regular monthly contribution
	EmployerMatch    float64         `json:"employer_match"`    // fraction of salary matched, e.g. 0.04
	EmployerMatchCap float64         `json:"employer_match_cap"` // max salary fraction matched, e.g. 0.04
	AssetAllocation  AssetAllocation `json:"asset_allocation"`
	StartMonth       int             `json:"start_month"`
}

// IRS annual contribution limits (2026). Kept here so the simulation engine
// can enforce them without hardcoding magic numbers throughout.
var IRSLimits2026 = map[AccountType]float64{
	AccountTypeTrad401k: 23500,
	AccountTypeRoth401k: 23500,
	AccountTypeTrad457b: 23500,
	AccountTypeTradIRA:  7000,
	AccountTypeRothIRA:  7000,
	AccountTypeHSA:      8750, // family coverage limit
}

// GivingTarget represents a recurring charitable giving commitment.
type GivingTarget struct {
	ID          uuid.UUID    `json:"id"`
	PlanID      uuid.UUID    `json:"plan_id"`
	Name        string       `json:"name"`    // e.g. "Church Tithe", "Local Charity"
	Basis       GivingBasis  `json:"basis"`   // gross or net
	Percentage  float64      `json:"percentage"` // e.g. 0.10 for 10%
	FixedAmount *float64     `json:"fixed_amount,omitempty"` // optional fixed monthly amount instead of %
	StartMonth  int          `json:"start_month"`
	EndMonth    *int         `json:"end_month,omitempty"`
}

// GivingBasis determines what income base the giving percentage applies to.
type GivingBasis string

const (
	GivingBasisGross GivingBasis = "gross" // before taxes
	GivingBasisNet   GivingBasis = "net"   // after taxes
)
