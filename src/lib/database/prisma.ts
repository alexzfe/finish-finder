// lib/database/prisma.ts
import { PrismaClient } from '@prisma/client'

// This prevents TypeScript errors in a global scope.
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

// This is the recommended approach for instantiating PrismaClient in a Next.js/serverless environment.
// It prevents creating too many connections by caching the client in a global variable.
const prisma = global.prisma || new PrismaClient({
  // Optional: Add logging to see what Prisma is doing.
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// In development, we cache the prisma instance on the global object to avoid exhausting
// the database connection limit with hot reloads.
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}

export default prisma;
export { prisma };
