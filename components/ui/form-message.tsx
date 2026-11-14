import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * Whole-form banner messages, rendered after the last field and before the
 * submit actions: FormMessage for failure (destructive), FormSuccess for a
 * completed inline write (success). Both use design-system color tokens and
 * the same rounded/banner shape so the two states look like one family.
 */
const bannerClass =
  "break-words rounded-lg border px-3 py-2 text-sm"

export function FormMessage({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  if (!children) return null
  return (
    <p
      role="alert"
      className={cn(
        bannerClass,
        "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
    >
      {children}
    </p>
  )
}

export function FormSuccess({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  if (!children) return null
  return (
    <p
      role="status"
      className={cn(
        bannerClass,
        "border-success/30 bg-success/10 text-success",
        className,
      )}
    >
      {children}
    </p>
  )
}
