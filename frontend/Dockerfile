# 1. Use Node 18
FROM node:18-alpine AS react-build

# 2. Install essential build tools (Git, Python, Make, G++)
# These are required to compile native code dependencies
RUN apk add --no-cache git python3 make g++

# 3. Set working directory
WORKDIR /app

# 4. Copy package files
COPY package.json yarn.lock* ./

# 5. Robust Install
RUN yarn config set network-timeout 600000 && \
    yarn install --legacy-peer-deps --frozen-lockfile --network-concurrency 1

# 6. Copy the rest of the code
COPY . .

# 7. Build using YARN
RUN CI=false DISABLE_ESLINT_PLUGIN=true GENERATE_SOURCEMAP=false yarn build

# 8. Serve using Nginx
FROM nginx:alpine
COPY --from=react-build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
