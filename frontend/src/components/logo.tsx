import { cn } from "@/lib/utils"

/**
 * FarmMarket brand mark: a barn-door arch framing a rising sun over ploughed
 * red-earth rows. Colours are fixed brand values (not theme tokens) so the
 * mark looks the same everywhere, including favicons and the dark footer.
 * Drawn without clip paths or gradients, so repeated copies on one page
 * need no unique SVG ids.
 */
export const BRAND = {
  green: "#3B5D42",
  /** Arch colour on dark surfaces, where the brand green would disappear. */
  sage: "#6E9474",
  sun: "#D9A441",
  earth: "#C1652F",
  cream: "#FAF6EC",
} as const

export function LogoMark({ className, tone = "default" }: { className?: string; tone?: "default" | "inverse" }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 35.5V19a15 15 0 0 1 30 0v16.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill={tone === "inverse" ? BRAND.sage : BRAND.green} />
      <path d="M12.5 24.5a7.5 7.5 0 0 1 15 0z" fill={BRAND.sun} />
      <path d="M5 24.5h30v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill={BRAND.earth} />
      <path
        d="M19.4 24.5h1.2l2.5 13h-6.2zM15.5 24.5h1.1l-4.8 13H7.4zM23.4 24.5h1.1l8.1 13h-4.4z"
        fill={BRAND.cream}
      />
    </svg>
  )
}

interface LogoProps {
  variant?: "mark" | "full"
  /** "inverse" is for dark surfaces such as the forest-green footer. */
  tone?: "default" | "inverse"
  /** Adds the "Direct from Australian farms" line under the wordmark. */
  tagline?: boolean
  className?: string
  iconClassName?: string
}

export function Logo({ variant = "full", tone = "default", tagline = false, className, iconClassName }: LogoProps) {
  if (variant === "mark") {
    return (
      <div className={className}>
        <LogoMark className={iconClassName} tone={tone} />
      </div>
    )
  }

  const inverse = tone === "inverse"
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={iconClassName} tone={tone} />
      <span className="flex flex-col">
        <span
          className={cn(
            "font-serif text-[1.375rem] leading-none font-bold tracking-[-0.015em]",
            inverse ? "text-forest-foreground" : "text-foreground"
          )}
        >
          Farm
          <span
            className={cn("font-semibold italic", inverse ? "text-gold" : "text-terracotta")}
            style={{ fontFamily: "var(--font-fraunces-italic), var(--font-fraunces), serif" }}
          >
            Market
          </span>
        </span>
        {tagline && (
          <span
            className={cn(
              "mt-1.5 text-[10px] leading-none font-bold tracking-[0.16em] uppercase",
              inverse ? "text-forest-foreground/70" : "text-muted-foreground"
            )}
          >
            Direct from Australian farms
          </span>
        )}
      </span>
    </div>
  )
}
