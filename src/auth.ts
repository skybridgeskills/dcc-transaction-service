// Re-export from new location for backward compatibility during migration
export {
  getTenant,
  authenticateTenant,
  authenticateTenantMiddleware
} from './lib/auth/auth.js'
