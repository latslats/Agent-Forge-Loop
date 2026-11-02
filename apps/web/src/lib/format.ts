const usd = (fractionDigits: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

const usdTwo = usd(2)
const usdFour = usd(4)
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** USD with two decimals, or four below one cent so small model costs stay readable. */
export function money(amount: number): string {
  const small = amount !== 0 && Math.abs(amount) < 0.01
  return (small ? usdFour : usdTwo).format(amount)
}

export function compactNumber(value: number): string {
  return compact.format(value)
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const time = new Date(iso)
  const elapsed = now - time.getTime()
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)} d ago`
  return shortDate.format(time)
}
