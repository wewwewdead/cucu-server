import cors from 'cors'
import express from 'express'
import { env } from './env'
import { meRouter } from './routes/me'
import { postsRouter } from './routes/posts'
import { profileRouter } from './routes/profile'

const app = express()

app.use(cors())
app.use(express.json())

// Liveness probe — no auth, no database. Safe to hit before Supabase is configured.
app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use(meRouter)
app.use(profileRouter)
app.use(postsRouter)

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`cucu server listening on :${env.port}`)
})
