FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies (workspace-aware)
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

RUN bun install --frozen-lockfile

# Copy source
COPY packages ./packages
COPY backend ./backend

WORKDIR /app/backend

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
