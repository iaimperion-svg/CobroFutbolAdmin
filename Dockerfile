FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
ARG DATABASE_URL
ARG REDIS_URL
ARG APP_URL
ARG JWT_SECRET
ARG WHATSAPP_VERIFY_TOKEN
ENV DATABASE_URL=${DATABASE_URL}
ENV REDIS_URL=${REDIS_URL}
ENV APP_URL=${APP_URL}
ENV JWT_SECRET=${JWT_SECRET}
ENV WHATSAPP_VERIFY_TOKEN=${WHATSAPP_VERIFY_TOKEN}
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV APP_RUNTIME=web
RUN mkdir -p /app/tessdata
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/eng.traineddata ./tessdata/eng.traineddata
COPY --from=builder /app/spa.traineddata ./tessdata/spa.traineddata
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
CMD ["sh", "./docker-entrypoint.sh"]
