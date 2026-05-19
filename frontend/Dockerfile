# Stage 1: Build the React Code
FROM node:18-alpine AS build

# Add compatibility for some node modules
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package.json yarn.lock* package-lock.json* ./

# Force install (try yarn first, then npm, without crashing)
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

# Copy the rest of the frontend code
COPY . .

# Build args
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Compile
RUN npm run build

# Stage 2: Serve the website using Nginx
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
RUN echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html index.htm; try_files \$uri \$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
