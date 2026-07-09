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
# Deliberately non-blocking (`;` not `&&`): this production DB's schema was
# largely built via `drizzle-kit push` before migrations were tracked here,
# so the migration history and the live schema can disagree even when the
# live schema is actually fine. A migration failure logs and falls through
# to starting the server rather than taking the whole API down. The
# underlying history mismatch needs a one-time manual baseline against the
# live DB (populate __drizzle_migrations for already-applied schema) before
# `db:migrate` will cleanly apply new migrations again.
CMD ["sh", "-c", "bun run db:migrate; bun run src/index.ts"]
