import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { connectDB } from './config/db.js'
import workspaceRoutes from './routes/workspaces.js'
import recordRoutes from './routes/records.js'

const app = express()
const PORT = process.env.PORT || 5000

const origins = (
  process.env.CLIENT_ORIGIN ||
  'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'
)
  .split(',')
  .map((s) => s.trim())

app.disable('x-powered-by')

app.use(helmet())

app.use(cors({
  origin(origin, cb) {
    if (!origin || origins.includes(origin)) {
      return cb(null, true)
    }

    return cb(new Error('Origin is not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json({ limit: '1mb' }))

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
}))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'StartupIQ Workspace API'
  })
})

app.use('/api/workspaces', workspaceRoutes)
app.use('/api/workspaces/:workspaceId/records', recordRoutes)

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  })
})

app.use((err, _req, res, _next) => {
  console.error(err)

  if (err.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ message: err.message })
  }

  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  })
})

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`StartupIQ API running at http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error(
      'Could not start API because MongoDB connection failed:',
      err.message
    )
    process.exit(1)
  })
