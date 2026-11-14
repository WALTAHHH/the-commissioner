import Image from 'next/image'

/**
 * Provider brand marks (logo-only — no business logic lives here).
 *
 * Assets (committed under `public/logos/`):
 * - espn.png    200x200 red-square icon — reads well on the light/newsprint bg
 * - espn.svg    120x40  red wordmark
 * - sleeper.svg 200x60  wordmark on its own dark rounded plate (bg baked into
 *               the asset, so no dark wrapper is needed on light surfaces)
 *
 * Width/height pairs are the assets' exact aspect ratios (2:1 for both the
 * Sleeper plate and the ESPN wordmark, 1:1 for the ESPN square) so the image
 * never stretches.
 */
const LOGOS = {
  sleeper: { src: '/logos/sleeper.svg', alt: 'Sleeper logo' },
  espn: { src: '/logos/espn.svg', alt: 'ESPN logo' },
} as const

export type ProviderLogoName = keyof typeof LOGOS

/** True when a connection's `provider` string has a brand mark (else callers keep the generic icon). */
export function isKnownProvider(provider: string): provider is ProviderLogoName {
  return Object.prototype.hasOwnProperty.call(LOGOS, provider)
}

const SIZES = {
  /** Compact mark for list/picker cards. */
  card: {
    wordmark: { width: 88, height: 44 },
    square: { width: 40, height: 40 },
  },
  /** Larger mark for page headers. */
  header: {
    wordmark: { width: 120, height: 60 },
    square: { width: 48, height: 48 },
  },
} as const

export type ProviderLogoProps = {
  provider: 'sleeper' | 'espn'
  /** `card` marks load lazily; `header` marks are above the fold and load eagerly. */
  size?: 'card' | 'header'
  /** Square/icon treatment instead of the wordmark (ESPN falls back to espn.png). */
  variant?: 'wordmark' | 'square'
}

export default function ProviderLogo({
  provider,
  size = 'card',
  variant = 'wordmark',
}: ProviderLogoProps) {
  const logo = LOGOS[provider]
  if (!logo) return null

  const useSquare = variant === 'square' && provider === 'espn'
  const { width, height } = SIZES[size][useSquare ? 'square' : 'wordmark']

  return (
    <Image
      src={useSquare ? '/logos/espn.png' : logo.src}
      alt={logo.alt}
      width={width}
      height={height}
      className="shrink-0"
      {...(size === 'header' ? { loading: 'eager', fetchPriority: 'high' } : {})}
    />
  )
}
