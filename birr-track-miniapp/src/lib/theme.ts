/**
 * Applies Telegram theme colors to the app's CSS variables for dark/light
 * support. Reads from the classic `window.Telegram.WebApp` surface (always
 * present inside Telegram) and re-applies on `themeChanged`. In a plain browser
 * the defaults in globals.css (light) are used and we honour prefers-color-scheme.
 */

interface TelegramThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  subtitle_text_color?: string
  section_bg_color?: string
  section_header_text_color?: string
  destructive_text_color?: string
}

interface TelegramWebApp {
  themeParams?: TelegramThemeParams
  colorScheme?: 'light' | 'dark'
  onEvent?: (event: string, handler: () => void) => void
  offEvent?: (event: string, handler: () => void) => void
  ready?: () => void
  expand?: () => void
}

function getWebApp(): TelegramWebApp | undefined {
  return (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
}

function setVar(name: string, value: string | undefined): void {
  if (value) document.documentElement.style.setProperty(name, value)
}

const FALLBACK_THEMES: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--tg-color-bg': '#ffffff',
    '--tg-unsafe-bg': '#ffffff',
    '--tg-color-text': '#000000',
    '--tg-unsafe-text': '#000000',
    '--tg-color-hint': '#8a8f98',
    '--tg-color-link': '#0088cc',
    '--tg-color-accent': '#0088cc',
    '--tg-color-button-text': '#ffffff',
    '--tg-color-section-bg': '#f2f2f2',
    '--tg-color-section-header-text': '#8a8f98',
    '--tg-color-subtitle-text': '#8a8f98',
    '--tg-color-destructive': '#ff3b30',
  },
  dark: {
    '--tg-color-bg': '#17212b',
    '--tg-unsafe-bg': '#17212b',
    '--tg-color-text': '#f5f5f5',
    '--tg-unsafe-text': '#f5f5f5',
    '--tg-color-hint': '#708499',
    '--tg-color-link': '#6ab3f3',
    '--tg-color-accent': '#5288c1',
    '--tg-color-button-text': '#ffffff',
    '--tg-color-section-bg': '#232e3c',
    '--tg-color-section-header-text': '#6ab3f3',
    '--tg-color-subtitle-text': '#708499',
    '--tg-color-destructive': '#ec3942',
  },
}

function preferredColorScheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyFallbackTheme(scheme: 'light' | 'dark'): void {
  for (const [name, value] of Object.entries(FALLBACK_THEMES[scheme])) setVar(name, value)
}

function applyTheme(): void {
  const wa = getWebApp()
  const params = wa?.themeParams
  const scheme = wa?.colorScheme ?? preferredColorScheme()

  // Establish a complete palette first so moving between dark and light modes
  // never leaves a stale Telegram or browser fallback value behind.
  applyFallbackTheme(scheme)

  if (params) {
    const accent = params.button_color || params.link_color
    setVar('--tg-color-bg', params.bg_color)
    setVar('--tg-unsafe-bg', params.bg_color)
    setVar('--tg-color-text', params.text_color)
    setVar('--tg-unsafe-text', params.text_color)
    setVar('--tg-color-hint', params.hint_color)
    setVar('--tg-color-link', params.link_color)
    setVar('--tg-color-accent', accent)
    setVar('--tg-color-button-text', params.button_text_color)
    setVar('--tg-color-section-bg', params.secondary_bg_color || params.section_bg_color)
    setVar('--tg-color-section-header-text', params.section_header_text_color)
    setVar('--tg-color-subtitle-text', params.subtitle_text_color || params.hint_color)
    setVar('--tg-color-destructive', params.destructive_text_color)
  }

  document.documentElement.dataset.theme = scheme
}

export function initTheme(): () => void {
  const wa = getWebApp()
  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  const onDeviceThemeChange = () => {
    // Telegram supplies its own theme and emits `themeChanged` when it updates.
    if (!getWebApp()?.colorScheme) applyTheme()
  }

  try {
    wa?.ready?.()
    wa?.expand?.()
  } catch {
    /* not in Telegram */
  }
  applyTheme()
  wa?.onEvent?.('themeChanged', applyTheme)
  mediaQuery?.addEventListener?.('change', onDeviceThemeChange)

  return () => {
    wa?.offEvent?.('themeChanged', applyTheme)
    mediaQuery?.removeEventListener?.('change', onDeviceThemeChange)
  }
}
