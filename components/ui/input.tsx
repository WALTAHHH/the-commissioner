import type { ComponentProps } from "react"
import { cn } from "cn"

/**
 * Design-system text input.
 *
 * Border/focus/invalid treatment mirrors `components/ui/button.tsx`
 * (border-input → focus-visible ring-ring → aria-invalid destructive ring) so
 * every control in a form shares the same ring language from globals.css.
 * `min-w-0` keeps the input shrinkable inside flex rows at narrow viewports.
 */

export const inputBaseClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputBaseClass, className)}
      {...props}
    />
  )
}

export { Input }
