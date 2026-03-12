FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.* ./
COPY postcss.config.* ./
COPY tailwind.config.* ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src
COPY index.html ./

RUN npm ci
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
