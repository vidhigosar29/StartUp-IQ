export const businessTypes = new Set(['home-bakery', 'jewellery', 'nail-artist', 'tailoring', 'boutique', 'beauty', 'crafts', 'other'])
export const recordTypes = new Set(['products', 'inventory', 'sales', 'expenses', 'customers', 'experiments'])
export const cleanText = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : ''
export function nonNegative(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}
