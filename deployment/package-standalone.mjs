import { cpSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'

const destination = resolve(process.argv[2] ?? 'build/standalone-release')
const revision = process.env.GITHUB_SHA ?? null
const privateFile = /^\.env(?:\.|$)|^(?:\.npmrc|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx|sqlite3?)$/i
const options = { recursive: true, verbatimSymlinks: true, filter: path => !privateFile.test(basename(path)) }

// Require a new destination so stale files from a previous build cannot ship.
mkdirSync(join(destination, '..'), { recursive: true })
mkdirSync(destination)
const nextOutput = realpathSync('.next')
cpSync(join(nextOutput, 'standalone'), destination, options)
cpSync('public', join(destination, 'public'), options)
cpSync(join(nextOutput, 'static'), join(destination, '.next', 'static'), options)
cpSync('deployment/start-standalone.mjs', join(destination, 'start.mjs'))
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
writeFileSync(join(destination, 'release.json'), JSON.stringify({
  revision,
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  target: process.env.RELEASE_TARGET ?? null,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  publicKeySha256: publicKey ? createHash('sha256').update(publicKey).digest('hex') : null,
}, null, 2) + '\n')
