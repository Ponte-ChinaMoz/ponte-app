FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:${PORT}/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
