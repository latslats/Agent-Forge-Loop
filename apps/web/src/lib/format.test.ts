import { describe, expect, it } from 'vitest'
import { compactNumber, money, timeAgo } from './format.ts'

describe('money', () => {
  it('shows two decimals from one cent up', () => {
    expect(money(0.5)).toBe('$0.50')
    expect(money(1234.5)).toBe('$1,234.50')
  })

  it('shows four decimals below one cent', () => {
    expect(money(0.0031)).toBe('$0.0031')
    expect(money(0)).toBe('$0.00')
  })
})

describe('compactNumber', () => {
  it('abbreviates thousands and millions', () => {
    expect(compactNumber(1200)).toBe('1.2K')
    expect(compactNumber(3_400_000)).toBe('3.4M')
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-10-13T12:00:00Z')

  it('describes recent times in minutes and hours', () => {
    expect(timeAgo('2026-10-13T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-10-13T11:55:00Z', now)).toBe('5 min ago')
    expect(timeAgo('2026-10-13T09:00:00Z', now)).toBe('3 h ago')
  })
})
