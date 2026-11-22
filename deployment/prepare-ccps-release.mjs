import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const [sourcePath, sourceSha, archivePath, expectedMain, bundlePath] = process.argv.slice(2)
const fullSha = /^[0-9a-f]{40}$/

if (!sourcePath || !archivePath || !bundlePath || !fullSha.test(sourceSha) || !fullSha.test(expectedMain)) {
  console.error('Usage: node deployment/prepare-ccps-release.mjs <source-repo> <approved-source-sha> <ccps-repo-or-mirror> <expected-ccps-main-sha> <output.bundle>')
  process.exit(1)
}

const output = resolve(bundlePath)
const archive = resolve(archivePath)
const source = resolve(sourcePath)
const bundleRef = 'refs/heads/maintflow-cutover-candidate'
const tempRoot = resolve(tmpdir())

if (existsSync(output) || !existsSync(dirname(output))) {
  throw new Error('Choose a new bundle filename in an existing directory.')
}

const scratch = mkdtempSync(join(tempRoot, 'maintflow-release-'))
const git = (...args) => execFileSync('git', ['-C', scratch, ...args], { encoding: 'utf8' }).trim()

try {
  git('init', '--bare')
  git('fetch', '--no-tags', archive, 'refs/heads/main')
  const parent = git('rev-parse', 'FETCH_HEAD')
  if (parent !== expectedMain) throw new Error('CCPs-INST main differs from the approved parent SHA.')

  git('fetch', '--no-tags', source, sourceSha)
  if (git('rev-parse', 'FETCH_HEAD') !== sourceSha) throw new Error('Source SHA did not match.')

  const paths = git('ls-tree', '-r', '--name-only', '-z', sourceSha).split('\0')
  const privatePath = /(^|\/)(?:\.env[^/]*|\.git-backup-local|node_modules|uploads|id_rsa|id_ed25519)(?:\/|$)|\.(?:db|sqlite3?|pem|key|p12|pfx)$/i
  if (paths.some(path => privatePath.test(path))) {
    throw new Error('The source snapshot contains a prohibited data, secret, or local-only path.')
  }

  const tree = git('rev-parse', `${sourceSha}^{tree}`)
  const candidate = git('-c', 'user.name=MaintFlow Release', '-c', 'user.email=maintflow-release@example.invalid',
    'commit-tree', tree, '-p', parent, '-m', `Deploy MaintFlow source ${sourceSha}`)

  git('update-ref', bundleRef, candidate)
  git('bundle', 'create', output, bundleRef, `^${parent}`)
  console.log(JSON.stringify({ bundle: output, candidate, parent, source: sourceSha, tree, ref: bundleRef }, null, 2))
} finally {
  if (dirname(resolve(scratch)) === tempRoot && basename(scratch).startsWith('maintflow-release-')) {
    rmSync(scratch, { recursive: true, force: true })
  }
}
