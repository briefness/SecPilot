FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/traffic-dye/package.json ./packages/traffic-dye/
COPY packages/ci-templates/package.json ./packages/ci-templates/
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN corepack enable && corepack prepare pnpm@latest --activate
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN cd apps/dashboard && pnpm build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
COPY infra/nginx-dashboard.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
