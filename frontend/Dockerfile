# 1. Use Node 18
FROM node:18-alpine AS react-build

# 2. Set working directory
WORKDIR /app

# 3. Copy package files
COPY package.json yarn.lock* ./

# 4. Install dependencies using YARN
RUN yarn install --legacy-peer-deps

# 5. Copy the rest of the code
COPY . .

# 6. Build using YARN
RUN CI=false DISABLE_ESLINT_PLUGIN=true GENERATE_SOURCEMAP=false yarn build

# 7. Serve using Nginx
FROM nginx:alpine
COPY --from=react-build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
