/**
 * Database Module
 *
 * Database utilities and Prisma client.
 */

export { prisma } from './prisma'
export {
  validateFightData,
  validateFighterData,
  type ValidationError,
  type ValidationResult,
} from './validation'
export {
  QueryMonitor,
  getDatabaseHealth,
  type QueryMetric,
  type QueryPerformanceReport,
} from './monitoring'
