FROM node:22-bookworm-slim
WORKDIR /app
COPY discovery/scheduler.mjs ./scheduler.mjs
USER node
CMD ["node", "scheduler.mjs"]
