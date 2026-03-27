package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/solomon/domain"
	"github.com/solomon/infrastructure/postgres"
	mw "github.com/solomon/api/middleware"
)

type AuthHandler struct {
	repo *postgres.Repository
}

func NewAuthHandler(repo *postgres.Repository) *AuthHandler {
	return &AuthHandler{repo: repo}
}

type registerRequest struct {
	Email     string `json:"email"    validate:"required,email"`
	Password  string `json:"password" validate:"required,min=8"`
	Name      string `json:"name"     validate:"required"`
	StateCode string `json:"state_code"`
	StateTax  float64 `json:"state_tax"`
}

type loginRequest struct {
	Email    string `json:"email"    validate:"required"`
	Password string `json:"password" validate:"required"`
}

type authResponse struct {
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
	User         domain.User `json:"user"`
}

// Register creates a new user + profile and returns auth tokens.
func (h *AuthHandler) Register(c echo.Context) error {
	var req registerRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	user, err := h.repo.CreateUser(c.Request().Context(), req.Email, req.Password)
	if err != nil {
		return echo.NewHTTPError(http.StatusConflict, "email already registered")
	}

	profile, err := h.repo.CreateProfile(c.Request().Context(), domain.Profile{
		UserID:    user.ID,
		Name:      req.Name,
		StateCode: req.StateCode,
		StateTax:  req.StateTax,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create profile")
	}

	access, err := mw.GenerateAccessToken(user.ID, profile.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate token")
	}
	refresh, err := mw.GenerateRefreshToken(user.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate refresh token")
	}

	return c.JSON(http.StatusCreated, authResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         user,
	})
}

// Login validates credentials and returns auth tokens.
func (h *AuthHandler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	user, hash, err := h.repo.GetUserByEmail(c.Request().Context(), req.Email)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	if err := comparePassword(hash, req.Password); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	profile, err := h.repo.GetProfileByUserID(c.Request().Context(), user.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "profile not found")
	}

	access, err := mw.GenerateAccessToken(user.ID, profile.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate token")
	}
	refresh, err := mw.GenerateRefreshToken(user.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate token")
	}

	return c.JSON(http.StatusOK, authResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         user,
	})
}
