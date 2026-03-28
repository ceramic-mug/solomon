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

echo "==> Starting PostgreSQL + API..."
docker compose up -d

echo "==> Waiting for API to be healthy..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:8082/health > /dev/null 2>&1; then
    echo "    API is up."
    break
  fi
  sleep 1
done

echo "==> Starting frontend dev server (http://localhost:3000)..."
cd frontend
npm run dev
