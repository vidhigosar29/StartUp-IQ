import { API_BASE_URL } from './apiConfig.js'

const WORKSPACE_KEY = 'startupiQ.workspace.v1'
const EMPTY_RECORDS = { products: [], inventory: [], sales: [], expenses: [], customers: [], experiments: [] }
const isMongoId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `API request failed (${response.status})`)
  return payload
}

function normaliseRecord(record) {
  return {
    ...record,
    id: record.id || record._id,
    amount: Number(record.amount || 0),
    quantity: Number(record.quantity ?? 1),
    createdAt: record.createdAt || record.updatedAt || new Date().toISOString(),
  }
}

function readLocalRecords(workspaceId) {
  try {
    return { ...EMPTY_RECORDS, ...(JSON.parse(localStorage.getItem(`startupiQ.records.${workspaceId}`) || '{}')) }
  } catch {
    return { ...EMPTY_RECORDS }
  }
}

function saveLocal(workspace) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
  return workspace
}

export const workspaceService = {
  get() {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) || 'null') } catch { return null }
  },

  async connect(localWorkspace) {
    if (!localWorkspace) return { workspace: null, connected: false }
    try {
      let remoteWorkspace
      if (isMongoId(localWorkspace.workspaceId)) {
        const payload = await request(`/workspaces/${localWorkspace.workspaceId}`)
        remoteWorkspace = payload.workspace
      } else {
        // Migrate an older browser-only workspace to MongoDB.
        const created = await request('/workspaces', {
          method: 'POST',
          body: JSON.stringify({ businessName: localWorkspace.businessName, businessType: localWorkspace.businessType }),
        })
        remoteWorkspace = created.workspace
        const oldRecords = readLocalRecords(localWorkspace.workspaceId)
        for (const [type, records] of Object.entries(oldRecords)) {
          for (const record of records || []) {
            await request(`/workspaces/${remoteWorkspace._id}/records`, {
              method: 'POST',
              body: JSON.stringify({ type, name: record.name, amount: record.amount, quantity: record.quantity, category: record.category, status: record.status, notes: record.notes }),
            })
          }
        }
      }
      const workspace = saveLocal({
        ...localWorkspace,
        ...remoteWorkspace,
        workspaceId: String(remoteWorkspace._id || remoteWorkspace.workspaceId),
      })
      return { workspace, connected: true }
    } catch (error) {
      console.warn('StartupIQ API unavailable; using local workspace storage.', error.message)
      return { workspace: localWorkspace, connected: false, error }
    }
  },

  async save(data) {
    try {
      const payload = isMongoId(data.workspaceId)
        ? await request(`/workspaces/${data.workspaceId}`, { method: 'PATCH', body: JSON.stringify({ businessName: data.businessName, businessType: data.businessType }) })
        : await request('/workspaces', { method: 'POST', body: JSON.stringify({ businessName: data.businessName, businessType: data.businessType }) })
      const workspace = saveLocal({ ...data, ...payload.workspace, workspaceId: String(payload.workspace._id || payload.workspace.workspaceId) })
      return { workspace, connected: true }
    } catch (error) {
      console.warn('Could not save workspace through API; saving in browser instead.', error.message)
      const workspace = saveLocal({ ...data, workspaceId: data.workspaceId || crypto.randomUUID(), updatedAt: new Date().toISOString() })
      return { workspace, connected: false, error }
    }
  },

  clear() {
    localStorage.removeItem(WORKSPACE_KEY)
  },
}

export const recordsService = {
  async list(workspaceId) {
    const { records = [] } = await request(`/workspaces/${workspaceId}/records`)
    const grouped = { ...EMPTY_RECORDS }
    for (const record of records) {
      if (grouped[record.type]) grouped[record.type].push(normaliseRecord(record))
    }
    return grouped
  },
  async create(workspaceId, type, record) {
    const { record: saved } = await request(`/workspaces/${workspaceId}/records`, {
      method: 'POST',
      body: JSON.stringify({ type, name: record.name, amount: record.amount, quantity: record.quantity, category: record.category, status: record.status, notes: record.notes }),
    })
    return normaliseRecord(saved)
  },
  async remove(workspaceId, _type, recordId) {
    return request(`/workspaces/${workspaceId}/records/${recordId}`, { method: 'DELETE' })
  },
}
