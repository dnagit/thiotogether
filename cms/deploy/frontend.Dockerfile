# Generic static frontend image — build ARG selects admin or website.
# docker build -f deploy/frontend.Dockerfile --build-arg APP=admin -t cms-admin .
FROM node:20-alpine AS build
ARG APP=website
ARG VITE_API_URL=/api/v1
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY shared/ shared/
COPY ${APP}/ ${APP}/
RUN npm ci --workspace ${APP} --include-workspace-root

ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w ${APP}

FROM nginx:1.27-alpine
ARG APP=website
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/${APP}/dist /usr/share/nginx/html
EXPOSE 80
