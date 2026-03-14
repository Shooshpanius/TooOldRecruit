FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./

RUN npm ci  --force

RUN rm -rf node_modules package-lock.json
RUN npm cache clean --force
RUN npm install  --force
COPY . .
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
