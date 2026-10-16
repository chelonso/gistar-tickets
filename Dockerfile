# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .

# Build arguments from Dokploy
ARG VITE_GATEWAY_URL
ENV VITE_GATEWAY_URL=${VITE_GATEWAY_URL:-/api}

RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /usr/src/app/dist /usr/share/nginx/html/tickets
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
