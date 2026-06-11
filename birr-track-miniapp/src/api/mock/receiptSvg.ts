/**
 * Generates a Receipt look-alike as an SVG data URI so the edit screen has a
 * realistic image to show without shipping binary fixtures. The image always
 * shows the *true* values — extraction may have failed, the Receipt didn't.
 */

export interface ReceiptFacts {
  bankName: string
  amount: number
  transactionId: string
  timestamp: string
  payer: string
}

const BANK_BRANDS: Record<string, { color: string; tagline: string }> = {
  'Commercial Bank of Ethiopia': { color: '#60269e', tagline: 'The Bank You Can Always Rely On!' },
  Telebirr: { color: '#199c4b', tagline: 'ethio telecom — telebirr' },
  'Awash Bank': { color: '#e87d1e', tagline: 'Awash Bank — Transforming Lives' },
  'Dashen Bank': { color: '#1b4f9c', tagline: 'Dashen Bank — Always One Step Ahead' },
  'Bank of Abyssinia': { color: '#b08d2f', tagline: 'Bank of Abyssinia' },
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function receiptDataUri(facts: ReceiptFacts): string {
  const brand = BANK_BRANDS[facts.bankName] ?? { color: '#444444', tagline: facts.bankName }
  const amount = new Intl.NumberFormat('en', { minimumFractionDigits: 2 }).format(facts.amount)
  const when = new Date(facts.timestamp)
  const date = when.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const row = (y: number, label: string, value: string) => `
    <text x="28" y="${y}" font-size="13" fill="#8a8f98">${esc(label)}</text>
    <text x="332" y="${y}" font-size="13" fill="#1d2733" text-anchor="end" font-weight="600">${esc(value)}</text>
    <line x1="28" y1="${y + 14}" x2="332" y2="${y + 14}" stroke="#eef0f3" stroke-width="1"/>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 520" font-family="-apple-system, 'Segoe UI', Roboto, sans-serif">
  <rect width="360" height="520" rx="14" fill="#ffffff"/>
  <rect width="360" height="96" rx="14" fill="${brand.color}"/>
  <rect y="48" width="360" height="48" fill="${brand.color}"/>
  <text x="28" y="44" font-size="19" font-weight="700" fill="#ffffff">${esc(facts.bankName)}</text>
  <text x="28" y="68" font-size="11" fill="#ffffff" opacity="0.85">${esc(brand.tagline)}</text>
  <circle cx="180" cy="140" r="26" fill="#e6f4ea"/>
  <path d="M168 140 l8 8 l16 -16" stroke="#1d9b4e" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="180" y="196" font-size="14" fill="#5b6470" text-anchor="middle">Payment Successful</text>
  <text x="180" y="232" font-size="30" font-weight="800" fill="#1d2733" text-anchor="middle">${esc(amount)} ETB</text>
  ${row(286, 'Transaction ID', facts.transactionId)}
  ${row(322, 'Date', date)}
  ${row(358, 'Time', time)}
  ${row(394, 'Paid by', facts.payer)}
  ${row(430, 'Status', 'Completed')}
  <text x="180" y="480" font-size="10" fill="#aab0b8" text-anchor="middle">Keep this receipt for your records — ${esc(facts.bankName)}</text>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
