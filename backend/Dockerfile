FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies (workspace-aware)
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY admin/package.json ./admin/

RUN bun install --frozen-lockfile

# Copy source
COPY packages ./packages
COPY backend ./backend

WORKDIR /app/backend

EXPOSE 3001

# Apply any pending drizzle migrations (idempotent — tracked in the
# __drizzle_migrations table, so a no-op boot costs one query) then start the
# server. Only this CMD does so: the worker and cron services in render.yaml
# override it with their own dockerCommand, so migrations only ever run from
# one place, avoiding concurrent-migration races across services.
#
# Blocking (`&&`) is deliberate: if a migration fails, the deploy should fail
# loudly rather than serve traffic against a schema the app doesn't actually
# have — better a failed deploy than a live server throwing mysterious
# column-not-found errors. This was briefly relaxed to `;` (non-blocking)
# during a one-time incident where the DB's migration history didn't match
# its live schema (backfilled via `drizzle-kit push` before migrations were
# tracked); that's been fixed and __drizzle_migrations is now baselined
# against reality, so `db:migrate` runs clean and fail-fast is safe again.
CMD ["sh", "-c", "bun run db:migrate && bun run src/index.ts"]
