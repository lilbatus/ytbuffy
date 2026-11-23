import { CHOICES, DEFAULTS, MULTI, RANGES, normalize } from '../shared/settings.js'
import { heightOf, minutesFor } from '../shared/estimate.js'
import { has, setLanguage, t, translate } from '../shared/i18n.js'

const SECTIONS = [
  ['sec_general', [
    { key: 'enabled', type: 'toggle' },
    { key: 'startMode', type: 'select' },
    { key: 'shorts', type: 'toggle' },
    { key: 'live', type: 'info' }
  ]],
  ['sec_quality', [
    { key: 'quality', type: 'select' },
    { key: 'qualityFallback', type: 'select', when: s => s.quality !== 'off' && s.quality !== 'max' },
    { key: 'refetchOnQualityChange', type: 'toggle' }
  ]],
  ['sec_prefetch', [
    { key: 'aheadMode', type: 'select' },
    { key: 'aheadMinutes', type: 'number', when: s => s.aheadMode === 'minutes' },
    { key: 'delayMs', type: 'number', step: 50 },
    { key: 'whilePaused', type: 'toggle' },
    { key: 'onSeek', type: 'select' },
    { key: 'boostReadahead', type: 'toggle' }
  ]],
  ['sec_memory', [
    { key: 'memoryMb', type: 'number', step: 50 },
    { key: 'estimate', type: 'estimate' },
    { key: 'onLimit', type: 'multi' },
    { key: 'onSwitch', type: 'select' },
    { key: 'keepVideos', type: 'number', when: s => s.onSwitch === 'keep' }
  ]],
  ['sec_offline', [
    { key: 'keepOnReload', type: 'toggle' },
    { key: 'trimCopy', type: 'toggle', when: s => s.keepOnReload },
    { key: 'trimCopyMinutes', type: 'number', when: s => s.keepOnReload && s.trimCopy },
    { key: 'retrySeconds', type: 'number' },
    { key: 'notifyConnection', type: 'toggle' },
    { key: 'warnSeconds', type: 'number', step: 5 }
  ]],
  ['sec_next', [
    { key: 'nextEnabled', type: 'toggle' },
    { key: 'nextSource', type: 'select', when: s => s.nextEnabled },
    { key: 'nextAmount', type: 'select', when: s => s.nextEnabled },
    { key: 'nextMinutes', type: 'number', when: s => s.nextEnabled && s.nextAmount === 'minutes' }
  ]],
  ['sec_appearance', [
    { key: 'progressBar', type: 'toggle' },
    { key: 'progressColor', type: 'color', when: s => s.progressBar },
    { key: 'indicator', type: 'toggle' },
    { key: 'notifyLoaded', type: 'toggle' }
  ]],
  ['sec_advanced', [
    { key: 'debug', type: 'toggle' },
    { key: 'mseVideoMb', type: 'number', step: 10 },
    { key: 'mseAudioMb', type: 'number' },
    { key: 'export', type: 'export' },
    { key: 'import', type: 'import' },
    { key: 'reset', type: 'reset' }
  ]]
]

let settings = DEFAULTS
let savedTimer = 0
const rows = []

start()

async function start() {
  settings = normalize((await chrome.storage.local.get('settings')).settings)
  for (const button of document.querySelectorAll('[data-language]')) {
    button.addEventListener('click', () => {
      if (button.dataset.language !== settings.language) save({ language: button.dataset.language })
    })
  }
  render()
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return
    const language = settings.language
    settings = normalize(changes.settings.newValue)
    if (settings.language !== language) render()
    else refresh()
  })
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function render() {
  setLanguage(settings.language)
  document.documentElement.lang = settings.language
  translate(document)
  document.title = `${t('extName')} · ${t('optionsTitle')}`
  document.getElementById('language').setAttribute('aria-label', t('languageLabel'))
  for (const button of document.querySelectorAll('[data-language]')) {
    const active = button.dataset.language === settings.language
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  }
  const root = document.getElementById('sections')
  root.replaceChildren()
  rows.length = 0
  for (const [title, items] of SECTIONS) {
    const section = element('section')
    section.append(element('h2', null, t(title)))
    for (const item of items) section.append(row(item))
    root.append(section)
  }
  refresh()
}

function row(item) {
  const control = CONTROLS[item.type](item)
  const wrapper = element('div', control.stacked ? 'row stacked' : 'row')
  const text = element('div', 'text')
  const label = element('label', 'label', t(`opt_${item.key}`))
  label.htmlFor = `opt-${item.key}`
  text.append(label, element('p', 'desc', t(`opt_${item.key}_desc`)))
  if (has(`opt_${item.key}_warn`)) text.append(element('p', 'warn', t(`opt_${item.key}_warn`)))
  wrapper.append(text, control.node)
  rows.push({ item, wrapper, control })
  return wrapper
}

function refresh() {
  for (const { item, wrapper, control } of rows) {
    wrapper.hidden = item.when ? !item.when(settings) : false
    control.set?.(settings[item.key])
  }
}

async function save(patch) {
  const language = settings.language
  settings = normalize({ ...settings, ...patch })
  await chrome.storage.local.set({ settings })
  if (settings.language !== language) render()
  else refresh()
  const saved = document.getElementById('saved')
  saved.classList.add('visible')
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => saved.classList.remove('visible'), 1200)
}

function choiceLabel(key, choice) {
  return t(`opt_${key}_${choice.replace(/-/g, '_')}`)
}

function estimateText() {
  const { memoryMb, quality } = settings
  if (quality === 'off') return t('estimateTwo', memoryMb, minutesFor(memoryMb, 1080), minutesFor(memoryMb, 720))
  if (quality === 'max') return t('estimateMax', memoryMb, minutesFor(memoryMb, 2160))
  return t('estimateOne', memoryMb, minutesFor(memoryMb, heightOf(quality)), `${quality}p`)
}

const CONTROLS = {
  toggle(item) {
    const node = element('label', 'switch')
    const input = element('input')
    input.type = 'checkbox'
    input.id = `opt-${item.key}`
    node.append(input, element('span'))
    input.addEventListener('change', () => save({ [item.key]: input.checked }))
    return { node, set: value => { input.checked = value } }
  },

  select(item) {
    const node = element('select')
    node.id = `opt-${item.key}`
    for (const choice of CHOICES[item.key]) {
      const option = element('option', null, choiceLabel(item.key, choice))
      option.value = choice
      node.append(option)
    }
    node.addEventListener('change', () => save({ [item.key]: node.value }))
    return { node, set: value => { node.value = value } }
  },

  multi(item) {
    const node = element('div', 'choices')
    node.id = `opt-${item.key}`
    node.setAttribute('role', 'group')
    const inputs = MULTI[item.key].map(choice => {
      const line = element('label', 'choice')
      const input = element('input')
      input.type = 'checkbox'
      input.value = choice
      line.append(input, element('span', null, choiceLabel(item.key, choice)))
      node.append(line)
      return input
    })
    for (const input of inputs) {
      input.addEventListener('change', () => save({ [item.key]: inputs.filter(box => box.checked).map(box => box.value) }))
    }
    return { node, stacked: true, set: value => { for (const input of inputs) input.checked = value.includes(input.value) } }
  },

  number(item) {
    const node = element('input')
    const [min, max] = RANGES[item.key]
    Object.assign(node, { type: 'number', id: `opt-${item.key}`, min, max, step: item.step || 1 })
    node.addEventListener('change', () => save({ [item.key]: node.value }))
    return { node, set: value => { node.value = value } }
  },

  color(item) {
    const node = element('input')
    Object.assign(node, { type: 'color', id: `opt-${item.key}` })
    node.addEventListener('input', () => save({ [item.key]: node.value }))
    return { node, set: value => { node.value = value } }
  },

  info(item) {
    return { node: element('span', 'value', t(`opt_${item.key}_value`)) }
  },

  estimate() {
    const node = element('span', 'value estimate')
    return { node, stacked: true, set: () => { node.textContent = estimateText() } }
  },

  export() {
    const node = element('div')
    const area = element('textarea')
    area.readOnly = true
    area.id = 'opt-export'
    const actions = element('div', 'actions')
    const copy = element('button', 'primary', t('actionCopy'))
    const note = element('span', 'note')
    actions.append(copy, note)
    node.append(area, actions)
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(area.value)
      note.textContent = t('actionCopied')
    })
    return { node, stacked: true, set: () => { area.value = JSON.stringify(settings, null, 2) } }
  },

  import() {
    const node = element('div')
    const area = element('textarea')
    area.id = 'opt-import'
    area.spellcheck = false
    const actions = element('div', 'actions')
    const apply = element('button', 'primary', t('actionApply'))
    const note = element('span', 'note')
    actions.append(apply, note)
    node.append(area, actions)
    apply.addEventListener('click', async () => {
      let parsed
      try {
        parsed = JSON.parse(area.value)
      } catch {
        note.textContent = t('importInvalid')
        return
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        note.textContent = t('importInvalid')
        return
      }
      await save(parsed)
      area.value = ''
      note.textContent = t('importDone')
    })
    return { node, stacked: true }
  },

  reset() {
    const node = element('button', null, t('actionReset'))
    node.id = 'opt-reset'
    node.addEventListener('click', () => {
      if (confirm(t('resetConfirm'))) save(DEFAULTS)
    })
    return { node }
  }
}
