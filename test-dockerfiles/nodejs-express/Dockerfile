# Node.js Express API with Libraries Example
# This demonstrates Chainguard Libraries for JavaScript detection

FROM node:20-slim

WORKDIR /app

# Copy dependency files - hover here to see library detection!
COPY package.json package-lock.json /app/

# Install dependencies
RUN npm ci --only=production

COPY . /app

EXPOSE 3000

CMD ["npm", "start"]
