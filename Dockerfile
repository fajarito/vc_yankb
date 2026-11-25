# syntax=docker/dockerfile:1
# Node 20 API image for OpenShift (non-root, PORT 8080, group 0).

FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# OpenShift may remount with arbitrary UID in group 0; keep tree group-writable.
RUN chgrp -R 0 /app && chmod -R g=u /app

USER 1001

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
