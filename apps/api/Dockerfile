# API + indexer + worker in one container. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t qarta-api .
# All configuration comes from environment variables (apps/api/.env.example); none is baked in.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter api... \
 && rm -rf apps/web contracts/out contracts/cache
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "api", "start:prod"]
