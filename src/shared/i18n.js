import { STRINGS } from './strings.js'

let language = 'en'

export function setLanguage(value) {
  language = STRINGS[value] ? value : 'en'
}

export function t(key, ...values) {
  const text = STRINGS[language][key] ?? STRINGS.en[key] ?? key
  return text.replace(/\{(\d)\}/g, (match, index) => String(values[Number(index)] ?? ''))
}

export function has(key) {
  return key in STRINGS.en
}

export function translate(root) {
  for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n)
}
