#!/usr/bin/env bash
set -e

# Solomon — rebuild backend and start frontend dev server.
# Usage: ./start.sh [--reset]
#   --reset   Wipe the database volume before starting (fresh DB)

cd "$(dirname "$0")"

RESET=false
for arg in "$@"; do
  case $arg in
    --reset) RESET=true ;;
  esac
done

echo "==> Building Docker image..."
docker compose build api

if [ "$RESET" = true ]; then
  echo "==> Resetting database volume..."
  docker compose down -v
fi

echo "==> Starting PostgreSQL..."
docker compose up -d postgres

echo "==> Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 20); do
  if docker compose exec -T postgres pg_isready -U solomon -q 2>/dev/null; then
    echo "    PostgreSQL is ready."
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "ERROR: PostgreSQL did not become ready in time." >&2
    exit 1
  fi
  sleep 1
done

echo "==> Starting API (force-recreating to pick up latest build)..."
docker compose up -d --force-recreate api

echo "==> Waiting for API to be healthy..."
API_UP=false
for i in $(seq 1 45); do
  if curl -sf http://localhost:8082/health > /dev/null 2>&1; then
    echo "    API is up (${i}s)."
    API_UP=true
    break
  fi
  printf "."
  sleep 1
done
echo ""

if [ "$API_UP" = false ]; then
  echo "ERROR: API did not become healthy in 45 seconds." >&2
  echo "       Check logs with: docker compose logs api" >&2
  exit 1
fi

# Give the API one extra second to fully bind all routes
sleep 1

echo "==> Starting frontend dev server (http://localhost:3000)..."
cd frontend
npm run dev
