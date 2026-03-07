FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY udp-proxy.js ./
EXPOSE 8080
USER node
CMD ["node", "udp-proxy.js"]
