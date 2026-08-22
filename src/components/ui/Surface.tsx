import type { ReactNode } from "react"

export function Surface({
  children,
  className,
  tone = "default",
  labelledBy,
  ariaLabel,
}: {
  children: ReactNode
  className?: string
  tone?: "default" | "subtle" | "accent" | "danger"
  labelledBy?: string
  ariaLabel?: string
}) {
  return (
    <section
      className={`ui-surface ui-surface--${tone}${className ? ` ${className}` : ""}`}
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
    >
      {children}
    </section>
  )
}

export function SectionHeader({
  title,
  description,
  eyebrow,
  actions,
  titleId,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  titleId?: string
}) {
  return (
    <header className="ui-section-header">
      <div className="ui-section-copy">
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        <h3 className="ui-section-title" id={titleId}>
          {title}
        </h3>
        {description ? <p className="ui-section-description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-section-actions">{actions}</div> : null}
    </header>
  )
}
