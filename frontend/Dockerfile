# Stage 1: Build the React Code using modern Node 18
FROM node:18 AS react-build

WORKDIR /app

# Copy ONLY the package.json first
COPY package.json ./

# Wipe corrupted lockfiles, then install ignoring strict version checks
RUN rm -f package-lock.json yarn.lock
RUN npm install --legacy-peer-deps

# EXPLICITLY patch the missing ajv modules (with the bypass flag!)
RUN npm install ajv@8 ajv-keywords@5 --legacy-peer-deps

# Copy the rest of the source code
COPY . .

# Set environment variables for the API
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ARG REACT_APP_GOOGLE_CLIENT_ID
ENV REACT_APP_GOOGLE_CLIENT_ID=$REACT_APP_GOOGLE_CLIENT_ID

# Force Node 18 to use legacy OpenSSL so Webpack doesn't crash, plus memory limits
ENV NODE_OPTIONS="--openssl-legacy-provider --max-old-space-size=2048"

# Build the app ignoring minor warnings
RUN CI=false DISABLE_ESLINT_PLUGIN=true GENERATE_SOURCEMAP=false npm run build

# Stage 2: Serve the website using Nginx
FROM nginx:alpine
COPY --from=react-build /app/build /usr/share/nginx/html
RUN echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html index.htm; try_files \$uri \$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
