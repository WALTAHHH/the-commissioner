import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * Canonical form-field structure: label → input → helper text → error.
 *
 * Every form in the app stacks its field content in exactly this order so a
 * label always sits above its control, helper text sits directly below the
 * control, and any error for that field renders last, under the helper.
 * Pass the control's `id` as `htmlFor` so label taps focus the input.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: string | null
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="break-words text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
