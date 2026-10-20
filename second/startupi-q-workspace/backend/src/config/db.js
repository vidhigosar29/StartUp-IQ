import mongoose from 'mongoose'

export async function connectDB() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing. Copy .env.example to .env and add your Atlas URI.')
  mongoose.set('strictQuery', true)
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  console.log(`MongoDB connected: ${mongoose.connection.name}`)
}
