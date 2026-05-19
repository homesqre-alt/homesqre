# Stage 1: Build the React Code
FROM node:18 AS react-build

WORKDIR /app

# Copy package files
COPY package.json yarn.lock* package-lock.json* ./

# MAGIC BULLET 1: Force NPM to ignore strict version conflicts
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Set environment variables for the API
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# MAGIC BULLET 2: Tell React not to crash if it sees minor warnings
ENV CI=false

# Build the app
RUN npm run build

# Stage 2: Serve the website using Nginx
FROM nginx:alpine
COPY --from=react-build /app/build /usr/share/nginx/html
RUN echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html index.htm; try_files \$uri \$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
