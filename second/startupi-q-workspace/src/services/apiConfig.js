// Centralized API and navigation configuration for StartupIQ Workspace.
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  '/api'
).replace(/\/$/, '');

export const DASHBOARD_URL = (
  import.meta.env.VITE_DASHBOARD_URL ||
  '/'
).replace(/\/$/, '');
