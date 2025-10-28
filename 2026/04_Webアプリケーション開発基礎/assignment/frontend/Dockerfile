FROM node:22-alpine3.21

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]
