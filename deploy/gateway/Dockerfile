FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml tsconfig.json vitest.config.ts ./
COPY src ./src

RUN corepack prepare pnpm@10.14.0 --activate \
  && pnpm install --frozen-lockfile \
  && pnpm run build \
  && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
