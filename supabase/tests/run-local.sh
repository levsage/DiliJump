#!/usr/bin/env bash
# Runs the SQL migration + tests against a throwaway local PostgreSQL database.
# Usage: npm run test:db   (needs `psql`; set PG* env vars to point at a server)
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${PGDATABASE_TEST:-dilijump_test}"
export PGDATABASE=postgres

psql -q -v ON_ERROR_STOP=1 -c "drop database if exists ${DB};" -c "create database ${DB};"
export PGDATABASE="${DB}"

psql -q -v ON_ERROR_STOP=1 -f supabase/tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -f "$f"
  psql -q -v ON_ERROR_STOP=1 -f "$f"   # must be re-runnable
done
psql -q -v ON_ERROR_STOP=1 -f supabase/tests/leaderboard_test.sql 2>&1 | grep -E 'PASS|PASSED|ERROR'
