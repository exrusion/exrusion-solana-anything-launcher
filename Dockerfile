FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server ./server
COPY tsconfig.json ./
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npm", "run", "server"]
