package domain

import "github.com/google/uuid"

// ChildSchoolPref specifies whether the child attends public or private K-12 schools.
// This affects the elementary/middle/high school cost phase estimates.
type ChildSchoolPref string

const (
	ChildSchoolPublic  ChildSchoolPref = "public"
	ChildSchoolPrivate ChildSchoolPref = "private"
)

// Child models a dependent whose costs are automatically projected through childhood
// and college by the simulation engine, inflation-adjusted from plan start.
type Child struct {
	ID               uuid.UUID       `json:"id"`
	PlanID           uuid.UUID       `json:"plan_id"`
	Name             string          `json:"name"`
	BirthMonth       int             `json:"birth_month"`       // 0-indexed from plan start; negative = already born
	SchoolPreference ChildSchoolPref `json:"school_preference"` // "public" | "private"
	CollegeAccountID *uuid.UUID      `json:"college_account_id,omitempty"` // linked 529 account; nil = no linkage
	IncludeActivities bool           `json:"include_activities"` // add sports/activities costs by phase
	IncludeFirstCar   bool           `json:"include_first_car"`  // add one-time car + insurance at age 16
}

// ---- Cost phase model ----
// All amounts are in 2026 dollars. The simulation engine applies inflation adjustment.

// ChildPhase describes costs for a developmental age window.
type ChildPhase struct {
	MinAgeMonths  int     // inclusive
	MaxAgeMonths  int     // exclusive (0 = no upper bound beyond last phase)
	MonthlyCost   float64 // base monthly cost
	ActivityAddon float64 // extra monthly cost when IncludeActivities = true
}

// ChildPhases defines baseline cost phases from birth through end of high school.
// College costs are handled separately via ChildCollegeCost* to distinguish public/private.
var ChildPhases = []ChildPhase{
	// Infant/Toddler: full-time childcare dominates
	{MinAgeMonths: 0, MaxAgeMonths: 36, MonthlyCost: 1_850, ActivityAddon: 0},
	// Preschool: part-time care + preschool tuition
	{MinAgeMonths: 36, MaxAgeMonths: 72, MonthlyCost: 1_400, ActivityAddon: 100},
	// Elementary: school + rec sports, food, clothing, healthcare
	{MinAgeMonths: 72, MaxAgeMonths: 156, MonthlyCost: 850, ActivityAddon: 175},
	// Middle school: activities ramp up, device costs, food increase
	{MinAgeMonths: 156, MaxAgeMonths: 192, MonthlyCost: 1_050, ActivityAddon: 275},
	// High school: social costs, driving prep, larger activity costs
	{MinAgeMonths: 192, MaxAgeMonths: 216, MonthlyCost: 1_250, ActivityAddon: 375},
}

// College costs per month (room + board + tuition + fees).
// Based on 2024 College Board averages, projected to ~2030 with inflation.
const (
	ChildCollegeCostPublic  = 2_850.0 // public 4-year in-state (~$34k/yr)
	ChildCollegeCostPrivate = 5_950.0 // private 4-year (~$71k/yr)
)

// ChildFirstCarCost is the one-time purchase cost of a first car at age 16.
const ChildFirstCarCost = 18_000.0

// ChildCarInsuranceMonthly is the monthly add-on for teen driver insurance
// added from the first car purchase until the child leaves for college (age 18).
const ChildCarInsuranceMonthly = 275.0

// ChildCollegeStartAgeMonths and ChildCollegeEndAgeMonths define the college window.
const (
	ChildFirstCarAgeMonths      = 192 // age 16 in months
	ChildDriverInsuranceEndAge  = 216 // age 18 — insurance add-on stops at college
	ChildCollegeStartAgeMonths  = 216 // age 18
	ChildCollegeEndAgeMonths    = 264 // age 22 (4-year college)
)

// ChildMonthlyBaseCost returns the base monthly cost for a child at a given age in months,
// before inflation adjustment. Returns 0 outside the modeled phases.
// schoolPref only affects the college phase; phases below college are equal for public/private.
// schoolPrivate adds a private-school tuition premium during K-12 years (ages 6-18).
func ChildMonthlyBaseCost(ageMonths int, pref ChildSchoolPref, activities, hasCar bool) float64 {
	// College window
	if ageMonths >= ChildCollegeStartAgeMonths && ageMonths < ChildCollegeEndAgeMonths {
		if pref == ChildSchoolPrivate {
			return ChildCollegeCostPrivate
		}
		return ChildCollegeCostPublic
	}

	// K-12 phases
	var cost float64
	for _, phase := range ChildPhases {
		if ageMonths >= phase.MinAgeMonths && ageMonths < phase.MaxAgeMonths {
			cost = phase.MonthlyCost
			if activities {
				cost += phase.ActivityAddon
			}
			break
		}
	}
	if cost == 0 {
		return 0 // beyond modeled horizon (>22yr) or before birth
	}

	// Private school premium for elementary through high school (ages 6-18)
	if pref == ChildSchoolPrivate && ageMonths >= 72 && ageMonths < ChildCollegeStartAgeMonths {
		// Add ~$1,100/mo for private K-12 tuition (~$13k/yr)
		cost += 1_100
	}

	// Teen driver insurance add-on
	if hasCar && ageMonths >= ChildFirstCarAgeMonths && ageMonths < ChildDriverInsuranceEndAge {
		cost += ChildCarInsuranceMonthly
	}

	return cost
}
