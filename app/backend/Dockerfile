# Build context is app/backend/
#   docker build -t rxmantra-backend app/backend
FROM node:20-slim
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PORT=3001 \
    ML_SERVICE_URL=http://ml:8000

EXPOSE 3001
CMD ["node", "server.js"]
