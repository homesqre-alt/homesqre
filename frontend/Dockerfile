# Stage 1: Build the React Code using Node 16 (Bypasses the OpenSSL Webpack crash)
FROM node:16 AS react-build

WORKDIR /app

# Copy package files
COPY package.json yarn.lock* package-lock.json* ./

# Force NPM to ignore strict version conflicts
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Set environment variables for the API and allocate specific memory for the build
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Build the app
RUN CI=false DISABLE_ESLINT_PLUGIN=true GENERATE_SOURCEMAP=false npm run build

# Stage 2: Serve the website using Nginx
FROM nginx:alpine
COPY --from=react-build /app/build /usr/share/nginx/html
RUN echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html index.htm; try_files \$uri \$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
