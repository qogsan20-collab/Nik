FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Accept build argument for API URL
ARG VITE_API_URL=http://localhost/api
ENV VITE_API_URL=${VITE_API_URL}

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev deps needed for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application with VITE_API_URL
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
