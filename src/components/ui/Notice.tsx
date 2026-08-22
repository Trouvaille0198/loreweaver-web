import type { ReactNode } from "react"

export function Notice({
  children,
  tone = "info",
  role,
}: {
  children: ReactNode
  tone?: "info" | "success" | "warning" | "danger"
  role?: "status" | "alert"
}) {
  return (
    <div className={`ui-notice ui-notice--${tone}`} role={role}>
      <span className="ui-notice-mark" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-mark" aria-hidden="true">
        ✦
      </span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  )
}
