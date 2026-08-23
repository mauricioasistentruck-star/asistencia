FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias e instalarlas
COPY package.json ./
RUN npm install --production

# Copiar el resto de los archivos del servidor y la web pública
COPY . .

# Puerto por defecto de HuggingFace o nube
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]
