# 1. Use Node 18
FROM node:18-alpine AS react-build

# 2. Install git (Required for some dependencies)
RUN apk add --no-cache git

# 3. Set working directory
WORKDIR /app

# 4. Copy package files
COPY package.json yarn.lock* ./

# 5. Install dependencies using YARN
RUN yarn install --legacy-peer-deps

# 6. Copy the rest of the code
COPY . .

# 7. Build using YARN
RUN CI=false DISABLE_ESLINT_PLUGIN=true GENERATE_SOURCEMAP=false yarn build

# 8. Serve using Nginx
FROM nginx:alpine
COPY --from=react-build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
