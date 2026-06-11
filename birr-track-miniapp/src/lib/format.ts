/**
 * Display formatting helpers. Money is ETB; timestamps render in
 * Africa/Addis_Ababa (EAT, UTC+3) regardless of the device timezone.
 */

const EAT_TIME_ZONE = 'Africa/Addis_Ababa'

const etbFormatter = new Intl.NumberFormat('en-ET', {
  style: 'currency',
  currency: 'ETB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "ETB 2,500.00" — falls back to a dash for null/undefined. */
export function formatEtb(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  return etbFormatter.format(amount)
}

/** Compact "ETB 18,750" for summary cards (no cents). */
export function formatEtbCompact(amount: number): string {
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB',
    maximumFractionDigits: 0,
  }).format(amount)
}

const eatDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: EAT_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const eatDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: EAT_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const eatShortFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: EAT_TIME_ZONE,
  day: '2-digit',
  month: 'short',
})

/** "11 Jun 2026" in EAT. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return eatDateFormatter.format(new Date(iso))
}

/** "11 Jun 2026, 14:30" in EAT. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return eatDateTimeFormatter.format(new Date(iso))
}

/** "11 Jun" in EAT — for dense rows. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return eatShortFormatter.format(new Date(iso))
}

/**
 * Convert an ISO timestamp to the value a <input type="datetime-local"> expects,
 * expressed in EAT so the user edits in their own clock, not UTC.
 */
export function toEatDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EAT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/**
 * Convert a datetime-local value (entered in EAT) back to an ISO UTC string.
 * EAT is a fixed UTC+3 with no DST, so we can offset directly.
 */
export function fromEatDatetimeLocal(local: string): string {
  if (!local) return ''
  // `local` is "YYYY-MM-DDTHH:mm" understood as EAT (UTC+3).
  return new Date(`${local}:00+03:00`).toISOString()
}
