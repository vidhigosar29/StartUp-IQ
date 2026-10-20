// Centralized workspace configuration
export const WORKSPACE_URL = (
  import.meta.env.VITE_WORKSPACE_URL || '/workspace'
).replace(/\/$/, '');
