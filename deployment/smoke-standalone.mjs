import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { request } from 'node:http'
import { join, resolve } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

const directory = resolve(process.argv[2] ?? 'build/standalone-release')
const port = process.argv[3] ?? '18100'
const origin = `http://127.0.0.1:${port}`
const publicOrigin = 'https://maintflow-smoke.example'
const staticFile = readdirSync(join(directory, '.next', 'static'), { recursive: true, withFileTypes: true })
  .find(entry => entry.isFile() && /\.(?:js|css)$/.test(entry.name))
assert.ok(staticFile, 'Package contains a Next.js static asset')
const assetPath = join(staticFile.parentPath, staticFile.name)
  .slice(join(directory, '.next', 'static').length + 1).replaceAll('\\', '/')

const child = spawn(process.execPath, [join(directory, 'start.mjs')], {
  cwd: directory,
  env: { ...process.env, PORT: port, HOSTNAME: '0.0.0.0', AUTH_TRUSTED_ORIGIN: publicOrigin },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

function loginStatus(browserOrigin) {
  return new Promise((resolve, reject) => {
    const host = new URL(publicOrigin).host
    const req = request(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: {
        Host: host,
        'X-Forwarded-Host': host,
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Port': '443',
        Origin: browserOrigin,
        'Content-Type': 'application/json',
      },
    }, response => {
      response.resume()
      resolve(response.statusCode)
    })
    req.on('error', reject)
    req.setTimeout(5000, () => req.destroy(new Error('Login smoke request timed out')))
    req.end('{}')
  })
}

try {
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.resume()
  for (let attempt = 0; attempt < 60 && !output.includes('Ready'); attempt++) {
    assert.equal(child.exitCode, null, 'Standalone process stayed running')
    await wait(250)
  }
  assert.ok(output.includes(`http://127.0.0.1:${port}`) && output.includes('Ready'), 'Standalone loopback listener became ready')

  assert.equal(await loginStatus(publicOrigin), 401, 'Trusted origin reaches login input validation')
  assert.equal(await loginStatus('https://untrusted.example'), 403, 'Foreign origin is rejected')
  console.log('Reverse-proxy origin checks: trusted 401, foreign 403')

  for (const [path, expected] of [['/', 200], ['/file.svg', 200], [`/_next/static/${assetPath}`, 200], ['/dashboard/work-orders', 307]]) {
    const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, expected, path)
    if (expected === 307) assert.equal(new URL(response.headers.get('location'), origin).pathname, '/')
    await response.arrayBuffer()
    console.log(`${response.status} ${path}`)
  }

  for (let batch = 0; batch < 5; batch++) {
    await Promise.all(Array.from({ length: 8 }, async () => {
      const response = await fetch(origin, { signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, 200)
      await response.arrayBuffer()
    }))
  }

  if (process.platform === 'win32') {
    const measurement = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `(Get-Process -Id ${child.pid}).PeakWorkingSet64`], { encoding: 'utf8' })
    console.log(`Peak process working set: ${(Number(measurement.trim()) / 1048576).toFixed(1)} MiB`)
  } else if (process.platform === 'linux') {
    const rss = execFileSync('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' })
    console.log(`Process RSS after smoke traffic: ${(Number(rss.trim()) / 1024).toFixed(1)} MiB`)
  }
} finally {
  child.kill()
}
