package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// Claims holds the JWT payload for Solomon auth tokens.
type Claims struct {
	UserID    uuid.UUID `json:"user_id"`
	ProfileID uuid.UUID `json:"profile_id"`
	jwt.RegisteredClaims
}

// JWTSecret is loaded from environment at startup.
var JWTSecret []byte

const (
	accessTokenDuration  = 12 * time.Hour      // long enough for a full dev session
	refreshTokenDuration = 90 * 24 * time.Hour // 90 days
)

// GenerateAccessToken creates a short-lived JWT for API access.
func GenerateAccessToken(userID, profileID uuid.UUID) (string, error) {
	claims := Claims{
		UserID:    userID,
		ProfileID: profileID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(accessTokenDuration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(JWTSecret)
}

// GenerateRefreshToken creates a long-lived token for session renewal.
func GenerateRefreshToken(userID uuid.UUID) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID.String(),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(refreshTokenDuration)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(JWTSecret)
}

// ValidateRefreshToken parses a refresh token and returns the user ID.
func ValidateRefreshToken(tokenStr string) (uuid.UUID, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return JWTSecret, nil
	})
	if err != nil || !token.Valid {
		return uuid.Nil, fmt.Errorf("invalid or expired refresh token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return uuid.Nil, fmt.Errorf("invalid token claims")
	}

	sub, _ := claims.GetSubject()
	id, err := uuid.Parse(sub)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid user id in token")
	}

	return id, nil
}

// RequireAuth is an Echo middleware that validates the Authorization: Bearer <token> header.
// On success, it injects the parsed Claims into the context as "claims".
func RequireAuth(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		header := c.Request().Header.Get("Authorization")
		if header == "" {
			return echo.NewHTTPError(http.StatusUnauthorized, "missing authorization header")
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid authorization format")
		}

		token, err := jwt.ParseWithClaims(parts[1], &Claims{}, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, echo.NewHTTPError(http.StatusUnauthorized, "unexpected signing method")
			}
			return JWTSecret, nil
		})
		if err != nil || !token.Valid {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired token")
		}

		claims, ok := token.Claims.(*Claims)
		if !ok {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid token claims")
		}

		c.Set("claims", claims)
		return next(c)
	}
}

// GetClaims extracts the authenticated user's claims from the Echo context.
func GetClaims(c echo.Context) *Claims {
	claims, _ := c.Get("claims").(*Claims)
	return claims
}
