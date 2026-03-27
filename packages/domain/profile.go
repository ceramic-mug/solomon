package domain

import (
	"time"

	"github.com/google/uuid"
)

// User is the authentication identity for a Solomon account.
type User struct {
	ID           uuid.UUID `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// Profile holds financial and personal context for a user.
type Profile struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Name      string    `json:"name"`
	StateCode string    `json:"state_code"` // e.g. "TX" — for state income tax lookup
	StateTax  float64   `json:"state_tax"`  // flat rate, e.g. 0.05 for 5%
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
