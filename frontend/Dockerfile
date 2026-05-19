# Stage 1: Build the React Code
FROM node:18-alpine AS build
WORKDIR /app
# Copy package files and install dependencies
COPY package.json yarn.lock* package-lock.json* ./
RUN yarn install || npm install
# Copy the rest of the frontend code
COPY . .
# Tell React where to find your live Python API
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
# Compile the website
RUN yarn build || npm run build

# Stage 2: Serve the website using Nginx
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
# Pro-Tip: This configuration ensures React Router doesn't break if a user refreshes the page
RUN echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html index.htm; try_files \$uri \$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
