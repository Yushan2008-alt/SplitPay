#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
pnpm migration:run

echo "[entrypoint] Starting API server..."
node dist/main &
API_PID=$!

echo "[entrypoint] Starting Worker process..."
node dist/worker &
WORKER_PID=$!

# Trap SIGTERM/SIGINT and forward to child processes
trap 'echo "[entrypoint] Shutting down..."; kill $API_PID $WORKER_PID 2>/dev/null; exit 0' SIGTERM SIGINT

echo "[entrypoint] Both processes running. API PID=$API_PID, Worker PID=$WORKER_PID"
wait
