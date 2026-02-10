# Use official Node.js LTS image
FROM node:25

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Start the app
CMD ["/bin/sh", "-c", "node deploy-commands.js && node index.js"]
