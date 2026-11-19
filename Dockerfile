# Image siap deploy: Node + LibreOffice (konversi DOCX -> PDF) + Poppler (PDF lampiran -> gambar)
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-core poppler-utils \
      fonts-liberation fonts-liberation2 fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.js"]
