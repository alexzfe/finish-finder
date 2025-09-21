import { PrismaClient } from '@prisma/client'
import { createQueryMonitoringMiddleware } from './monitoring'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create PrismaClient only if DATABASE_URL is available
// This prevents build-time errors when env vars aren't set
function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    return null
  }

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  })

  // Add query performance monitoring middleware
  client.$use(createQueryMonitoringMiddleware())

  return client
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma
}