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
# If the migration fails, `&&` stops the container from starting — Render
# reports the deploy as failed instead of serving against a stale schema.
CMD ["sh", "-c", "bun run db:migrate && bun run src/index.ts"]
