import { Router } from 'express'
import mongoose from 'mongoose'
import Workspace from '../models/Workspace.js'
import BusinessRecord from '../models/BusinessRecord.js'
import { cleanText, nonNegative, recordTypes } from '../utils/validation.js'
const router = Router({ mergeParams: true })

async function workspaceExists(req, res) {
  if (!mongoose.isValidObjectId(req.params.workspaceId)) { res.status(400).json({ message: 'Invalid workspace ID.' }); return false }
  const exists = await Workspace.exists({ _id: req.params.workspaceId })
  if (!exists) { res.status(404).json({ message: 'Workspace not found.' }); return false }
  return true
}
router.get('/', async (req, res, next) => {
  try {
    if (!await workspaceExists(req, res)) return
    const filter = { workspaceId: req.params.workspaceId }
    if (req.query.type) {
      if (!recordTypes.has(req.query.type)) return res.status(400).json({ message: 'Invalid record type.' })
      filter.type = req.query.type
    }
    const records = await BusinessRecord.find(filter).sort({ createdAt: -1 }).lean()
    res.json({ records })
  } catch (e) { next(e) }
})
router.post('/', async (req, res, next) => {
  try {
    if (!await workspaceExists(req, res)) return
    const { type } = req.body
    const name = cleanText(req.body.name)
    if (!recordTypes.has(type)) return res.status(400).json({ message: 'Choose a valid record type.' })
    if (!name) return res.status(400).json({ message: 'Record name is required.' })
    const amount = nonNegative(req.body.amount, 0), quantity = nonNegative(req.body.quantity, 1)
    if (amount === null || quantity === null) return res.status(400).json({ message: 'Amount and quantity must be non-negative numbers.' })
    const record = await BusinessRecord.create({ workspaceId: req.params.workspaceId, type, name, amount, quantity, category: cleanText(req.body.category, 80) || 'General', status: cleanText(req.body.status, 40) || 'Paid', notes: cleanText(req.body.notes, 1000) })
    res.status(201).json({ record })
  } catch (e) { next(e) }
})
router.patch('/:recordId', async (req, res, next) => {
  try {
    if (!await workspaceExists(req, res)) return
    if (!mongoose.isValidObjectId(req.params.recordId)) return res.status(400).json({ message: 'Invalid record ID.' })
    const updates = {}
    for (const key of ['name', 'category', 'status', 'notes']) if (req.body[key] !== undefined) updates[key] = cleanText(req.body[key], key === 'notes' ? 1000 : key === 'name' ? 160 : 80)
    for (const key of ['amount', 'quantity']) if (req.body[key] !== undefined) {
      const n = nonNegative(req.body[key]); if (n === null) return res.status(400).json({ message: `${key} must be non-negative.` }); updates[key] = n
    }
    const record = await BusinessRecord.findOneAndUpdate({ _id: req.params.recordId, workspaceId: req.params.workspaceId }, updates, { new: true, runValidators: true })
    if (!record) return res.status(404).json({ message: 'Record not found in this workspace.' })
    res.json({ record })
  } catch (e) { next(e) }
})
router.delete('/:recordId', async (req, res, next) => {
  try {
    if (!await workspaceExists(req, res)) return
    if (!mongoose.isValidObjectId(req.params.recordId)) return res.status(400).json({ message: 'Invalid record ID.' })
    const record = await BusinessRecord.findOneAndDelete({ _id: req.params.recordId, workspaceId: req.params.workspaceId })
    if (!record) return res.status(404).json({ message: 'Record not found in this workspace.' })
    res.json({ message: 'Record deleted.' })
  } catch (e) { next(e) }
})
export default router
