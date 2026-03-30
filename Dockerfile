FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY src/ ./src/
# Ensure sharp native binaries are available after build
# This will copy all dependency binaries installed under node_modules (including sharp files)
RUN bun run build --target bun --outfile imagex

FROM oven/bun:1-alpine AS runner

WORKDIR /app

COPY --from=builder /app/imagex ./imagex

# Copy node_modules/.pnpm and node_modules/sharp directory for sharp native binaries
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /root/.bun ./root/.bun
CMD ["bun", "--smol", "./imagex"]
