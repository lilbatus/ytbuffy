import { build, context } from 'esbuild'
import { cp, rm } from 'node:fs/promises'

const options = {
  entryPoints: {
    page: 'src/page/main.js',
    content: 'src/content/main.js',
    popup: 'src/popup/popup.js',
    options: 'src/options/options.js',
    background: 'src/background/main.js',
    vault: 'src/vault/main.js',
    watch: 'src/replay/main.js'
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  logLevel: 'info'
}

await rm('dist', { recursive: true, force: true })
await cp('static', 'dist', { recursive: true })

if (process.argv.includes('--watch')) {
  const watcher = await context(options)
  await watcher.watch()
} else {
  await build(options)
}
