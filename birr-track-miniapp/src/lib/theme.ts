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
  ready?: () => void
  expand?: () => void
}

function getWebApp(): TelegramWebApp | undefined {
  return (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
}

function setVar(name: string, value: string | undefined): void {
  if (value) document.documentElement.style.setProperty(name, value)
}

function applyTheme(): void {
  const wa = getWebApp()
  const params = wa?.themeParams
  if (!params) {
    // Browser dev mode: respect the OS dark-mode preference with a sensible palette.
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      applyDarkFallback()
    }
    return
  }

  const accent = params.button_color || params.link_color
  setVar('--tg-color-bg', params.bg_color)
  setVar('--tg-unsafe-bg', params.bg_color)
  setVar('--tg-color-text', params.text_color)
  setVar('--tg-unsafe-text', params.text_color)
  setVar('--tg-color-hint', params.hint_color)
  setVar('--tg-color-link', params.link_color)
  setVar('--tg-color-accent', accent)
  setVar('--tg-color-section-bg', params.secondary_bg_color || params.section_bg_color)
  setVar('--tg-color-section-header-text', params.section_header_text_color)
  setVar('--tg-color-subtitle-text', params.subtitle_text_color || params.hint_color)
  setVar('--tg-color-destructive', params.destructive_text_color)

  if (wa?.colorScheme) {
    document.documentElement.dataset.theme = wa.colorScheme
  }
}

function applyDarkFallback(): void {
  const dark: Record<string, string> = {
    '--tg-color-bg': '#17212b',
    '--tg-unsafe-bg': '#17212b',
    '--tg-color-text': '#f5f5f5',
    '--tg-unsafe-text': '#f5f5f5',
    '--tg-color-hint': '#708499',
    '--tg-color-link': '#6ab3f3',
    '--tg-color-accent': '#5288c1',
    '--tg-color-section-bg': '#232e3c',
    '--tg-color-section-header-text': '#6ab3f3',
    '--tg-color-subtitle-text': '#708499',
    '--tg-color-destructive': '#ec3942',
  }
  for (const [k, v] of Object.entries(dark)) setVar(k, v)
  document.documentElement.dataset.theme = 'dark'
}

export function initTheme(): void {
  const wa = getWebApp()
  try {
    wa?.ready?.()
    wa?.expand?.()
  } catch {
    /* not in Telegram */
  }
  applyTheme()
  wa?.onEvent?.('themeChanged', applyTheme)
}
