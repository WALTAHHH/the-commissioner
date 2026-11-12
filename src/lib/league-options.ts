// Shared, transport-safe constants for league creation.
// Kept out of server-action modules so client components can import them
// ('use server' files may only export async functions).

export const SPORT_OPTIONS = [
  { value: 'football', label: 'Football' },
  { value: 'basketball', label: 'Basketball' },
  { value: 'baseball', label: 'Baseball' },
  { value: 'hockey', label: 'Hockey' },
] as const

export const FORMAT_OPTIONS = [
  { value: 'redraft', label: 'Redraft' },
  { value: 'keeper', label: 'Keeper' },
  { value: 'dynasty', label: 'Dynasty' },
  { value: 'auction', label: 'Auction' },
  { value: 'snake', label: 'Snake' },
  { value: 'superflex', label: 'Superflex' },
  { value: 'best-ball', label: 'Best Ball' },
  { value: 'guillotine', label: 'Guillotine' },
  { value: 'custom', label: 'Custom' },
] as const

export const DEFAULT_SPORT = 'football'
export const DEFAULT_FORMAT = 'redraft'

export type SportValue = (typeof SPORT_OPTIONS)[number]['value']
export type FormatValue = (typeof FORMAT_OPTIONS)[number]['value']

export function isValidSport(value: string): boolean {
  return SPORT_OPTIONS.some((o) => o.value === value)
}

export function isValidFormat(value: string): boolean {
  return FORMAT_OPTIONS.some((o) => o.value === value)
}
