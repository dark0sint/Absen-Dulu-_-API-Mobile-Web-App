FROM node:20-bookworm-slim

# better-sqlite3 butuh alat build native saat instalasi
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

RUN mkdir -p /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
