# Multi-stage build (ADR-X4) - build tooling never ships in the final image, keeping the
# runtime image lean.
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build:ts

FROM node:24-alpine
WORKDIR /app
# Non-root user + minimal base image - standard container-security practice (ADR-B9).
RUN corepack enable && addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
USER nodejs
EXPOSE 3000
CMD ["node", "dist/server.js"]
