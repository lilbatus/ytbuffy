import { build, context } from 'esbuild'
import { zipSync } from 'fflate'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BROWSERS = ['chrome', 'edge', 'brave', 'vivaldi', 'opera', 'operagx', 'yandex', 'firefox']

const CHROMIUM_ENTRIES = {
  page: 'src/page/main.js',
  content: 'src/content/main.js',
  popup: 'src/popup/popup.js',
  options: 'src/options/options.js',
  background: 'src/background/main.js',
  vault: 'src/vault/main.js',
  watch: 'src/replay/main.js'
}

const FIREFOX_ENTRIES = {
  page: 'src/page/main.js',
  content: 'src/content/main.js',
  popup: 'src/popup/popup.js',
  options: 'src/options/options.js',
  background: 'src/background/firefox.js',
  watch: 'src/replay/main.js'
}

const watching = process.argv.includes('--watch')
const zipping = process.argv.includes('--zip')
const picked = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const unknown = picked.filter(name => !BROWSERS.includes(name))
if (unknown.length) throw new Error(`Unknown browser: ${unknown.join(', ')}. Pick from ${BROWSERS.join(', ')}.`)
const browsers = picked.length ? picked : BROWSERS

function options(browser) {
  const firefox = browser === 'firefox'
  const define = { 'process.env.BROWSER': JSON.stringify(browser) }
  if (firefox) define.chrome = 'browser'
  return {
    entryPoints: firefox ? FIREFOX_ENTRIES : CHROMIUM_ENTRIES,
    outdir: `dist/${browser}`,
    bundle: true,
    format: 'iife',
    target: firefox ? 'firefox140' : 'chrome120',
    define,
    logLevel: watching ? 'info' : 'warning'
  }
}

async function copyStatic(browser, outdir) {
  const firefox = browser === 'firefox'
  await cp('static', outdir, {
    recursive: true,
    filter: source => !source.endsWith('manifest.firefox.json') && !(firefox && source.endsWith('vault.html'))
  })
  if (firefox) await cp('static/manifest.firefox.json', join(outdir, 'manifest.json'))
}

async function files(folder) {
  const result = {}
  for (const name of await readdir(folder, { recursive: true })) {
    const path = join(folder, name)
    if ((await stat(path)).isFile()) result[name.replaceAll('\\', '/')] = await readFile(path)
  }
  return result
}

for (const browser of browsers) {
  const config = options(browser)
  await rm(config.outdir, { recursive: true, force: true })
  await copyStatic(browser, config.outdir)
  if (watching) await (await context(config)).watch()
  else await build(config)
}

if (zipping) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'))
  await mkdir('release', { recursive: true })
  for (const browser of browsers) {
    await writeFile(`release/ytbuffy-${browser}-v${version}.zip`, zipSync(await files(`dist/${browser}`), { level: 9 }))
  }
}

if (!watching) console.log(`built ${browsers.join(', ')}${zipping ? ', zips in release/' : ''}`)
