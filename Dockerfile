FROM node:20-bookworm

WORKDIR /app

# Install production and dev dependencies (ts-node is needed at runtime)
COPY package.json package-lock.json* ./
RUN npm install --include=dev

# Copy remaining project files
COPY . .

# Ensure Prisma client is generated (postinstall already handles this, but run again for safety)
RUN npx prisma generate

ENV NODE_ENV=production

# Default command runs the scraper's "check" mode
CMD ["node", "scripts/automated-scraper.js", "check"]
