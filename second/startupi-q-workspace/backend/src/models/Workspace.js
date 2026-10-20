import mongoose from 'mongoose'

const workspaceSchema = new mongoose.Schema({
  businessName: { type: String, required: true, trim: true, maxlength: 70 },
  businessType: { type: String, required: true, enum: ['home-bakery', 'jewellery', 'nail-artist', 'tailoring', 'boutique', 'beauty', 'crafts', 'other'] },
}, { timestamps: true })

export default mongoose.model('Workspace', workspaceSchema)
