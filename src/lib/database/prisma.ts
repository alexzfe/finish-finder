import { PrismaClient } from '@prisma/client'

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

  // Add monitoring middleware only after successful client creation
  if (typeof window === 'undefined' && process.env.DATABASE_URL) {
    // Use setTimeout to defer middleware registration until after module initialization
    setTimeout(() => {
      try {
        const { createQueryMonitoringMiddleware } = require('./monitoring')
        client.$use(createQueryMonitoringMiddleware())
      } catch (error) {
        // Monitoring is optional - don't break the app if it fails
        console.warn('Could not load monitoring middleware:', error.message)
      }
    }, 0)
  }

  return client
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma
}