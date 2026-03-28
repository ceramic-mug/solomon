package main

import (
	"fmt"
	"log"
	"os"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	"github.com/solomon/api/handlers"
	mw "github.com/solomon/api/middleware"
	"github.com/solomon/api/routes"
	"github.com/solomon/infrastructure/postgres"
)

func main() {
	// ---- Config from environment ----
	dsn := env("DATABASE_URL", "postgres://solomon:solomon@localhost:5432/solomon?sslmode=disable")
	jwtSecret := env("JWT_SECRET", "dev-secret-change-me-in-production")
	port := env("PORT", "8080")
	geminiKey := env("GEMINI_API_KEY", "")

	mw.JWTSecret = []byte(jwtSecret)

	// ---- Database ----
	db, err := postgres.Open(dsn)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	if err := postgres.Migrate(db); err != nil {
		log.Fatalf("run migrations: %v", err)
	}
	log.Println("database connected and migrations applied")

	repo := postgres.NewRepository(db)

	// ---- Handlers ----
	authHandler := handlers.NewAuthHandler(repo)
	planHandler := handlers.NewPlanHandler(repo)
	compHandler := handlers.NewComponentHandler(repo)
	simHandler := handlers.NewSimulateHandler(repo)
	aiHandler := handlers.NewAIHandler(repo, geminiKey)

	// ---- Echo ----
	e := echo.New()
	e.HideBanner = true

	// Global middleware
	e.Use(echomw.Logger())
	e.Use(echomw.Recover())
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins: []string{"*"}, // tighten in production
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAuthorization},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
	}))
	e.Use(echomw.RequestID())

	// Routes
	routes.Register(e, authHandler, planHandler, compHandler, simHandler, aiHandler)

	// Health check (no auth required)
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(200, map[string]string{"status": "ok", "service": "solomon-api"})
	})

	log.Printf("Solomon API starting on :%s", port)
	if err := e.Start(fmt.Sprintf(":%s", port)); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
