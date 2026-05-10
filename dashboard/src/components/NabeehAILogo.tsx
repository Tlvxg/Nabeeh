import { useTheme } from '../hooks/useTheme.ts'

interface NabeehAILogoProps {
  size?: number
}

/** Theme-aware Nabeeh AI logo (4-pointed sparkle). */
export function NabeehAILogo({ size = 14 }: NabeehAILogoProps) {
  const theme = useTheme()
  const src = theme === 'dark'
    ? `${import.meta.env.BASE_URL}assets/ask-nabeeh-dark.svg`
    : `${import.meta.env.BASE_URL}assets/ask-nabeeh.svg`

  return <img src={src} alt="اسأل نبيه" width={size} height={size} style={{ display: 'block' }} />
}
