FROM node:20-alpine

WORKDIR /app

COPY package.json ./
# Install at build time in real usage. In restricted environments, this may be skipped.
RUN npm install --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
