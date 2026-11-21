import { cpSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
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
writeFileSync(join(destination, 'release.json'), JSON.stringify({ revision, platform: process.platform, arch: process.arch, node: process.version }, null, 2) + '\n')
