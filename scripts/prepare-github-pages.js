#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { spawn } = require('child_process')
const fs = require('fs/promises')
const path = require('path')

const repoRoot = process.cwd()
const scriptsDir = path.join(repoRoot, 'scripts')

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      }
    })
  })

async function main() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || 'finish-finder'

  console.log('🔄 Exporting static event data...')
  await run('node', [path.join(scriptsDir, 'export-static-data.js')])

  console.log(`🏗️ Building static site with base path "/${basePath}" ...`)
  await run('npx', ['next', 'build'], {
    env: {
      ...process.env,
      NEXT_PUBLIC_BASE_PATH: basePath
    }
  })

  const outDir = path.join(repoRoot, 'out')
  const docsDir = path.join(repoRoot, 'docs')

  console.log('🧹 Refreshing docs/ directory...')
  await fs.rm(docsDir, { recursive: true, force: true })
  await fs.mkdir(docsDir, { recursive: true })

  console.log('📦 Copying static export into docs/...')
  await fs.cp(outDir, docsDir, { recursive: true })

  console.log('✅ GitHub Pages build ready!')
  console.log('   • public/data/events.json refreshed with latest database data')
  console.log('   • docs/ now contains the static site (commit & push to publish)')
  console.log(`   • Served under https://<user>.github.io/${basePath}/`) 
}

main().catch((error) => {
  console.error('❌ GitHub Pages preparation failed:', error)
  process.exit(1)
})
