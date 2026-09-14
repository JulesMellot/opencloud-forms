FROM node:24-alpine

WORKDIR /app
COPY server/*.ts ./server/
COPY src/schema.ts ./src/schema.ts
COPY l10n/translations.json ./l10n/translations.json
RUN rm -f server/*.test.ts

USER node
ENV HOST=0.0.0.0 PORT=9780
EXPOSE 9780
HEALTHCHECK CMD wget -qO- http://127.0.0.1:9780/healthz || exit 1
CMD ["node", "server/server.ts"]
