import { app } from './hono.js'
import { getConfig } from './lib/config/config.js'
import { serve } from '@hono/node-server'

const run = async () => {
  const config = getConfig()
  const port = config.port

  // KeyValueStore is initialized via app context in hooks.server.ts
  console.log(`Server running on port ${port}`)
  serve({
    fetch: app.fetch,
    port
  })
}

run()
