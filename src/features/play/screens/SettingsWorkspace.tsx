import { useEffect, useMemo, type KeyboardEvent, type ReactNode } from "react"
import { Button } from "../../../components/ui"

export type SettingsNavItem<Key extends string> = {
  key: Key
  label: string
  icon: SettingsNavIcon
}

export type SettingsNavGroup<Key extends string> = {
  label?: string
  items: readonly SettingsNavItem<Key>[]
}

export type SettingsNavIcon =
  "appearance" | "language" | "connection" | "access" | "module" | "worldbook" | "rules" | "skills" | "model"

function SettingsIcon({ name }: { name: SettingsNavIcon }) {
  const paths: Record<SettingsNavIcon, ReactNode> = {
    appearance: (
      <>
        <path d="M5 4.5h10M7 8.5h6M9 12.5h2M10 15.5v-3" />
        <circle cx="10" cy="10" r="7" />
      </>
    ),
    language: (
      <>
        <path d="M3.5 5.5h8M7.5 3.5v2M5 5.5c.4 3 2.4 5.3 5.5 6.5M10 5.5c-.5 2.9-2.4 5.2-5.5 6.5M11.5 15.5l2.8-7 2.7 7M12.5 13h3.6" />
      </>
    ),
    connection: (
      <>
        <path d="M6.2 13.8a5.4 5.4 0 0 1 7.6 0M3.5 11a9.2 9.2 0 0 1 13 0M8.8 16.4a1.7 1.7 0 0 1 2.4 0" />
      </>
    ),
    access: (
      <>
        <circle cx="7" cy="10" r="3" />
        <path d="M10 10h7M14 10v2M16 10v2" />
      </>
    ),
    module: (
      <>
        <path d="M4 4.5h8l4 4v7H4zM12 4.5v4h4M7 12h6" />
      </>
    ),
    worldbook: (
      <>
        <path d="M3.5 5.5c2.5-.8 4.7-.3 6.5 1.2v9c-1.8-1.5-4-2-6.5-1.2zM16.5 5.5c-2.5-.8-4.7-.3-6.5 1.2v9c1.8-1.5 4-2 6.5-1.2z" />
      </>
    ),
    rules: (
      <>
        <path d="M5 4h10M5 8h10M5 12h6M5 16h6M14 12v4M12 14h4" />
      </>
    ),
    skills: (
      <>
        <path d="m10 3 1.5 4.2L16 8.5l-3.5 2.7.2 4.8-2.7-2-2.7 2 .2-4.8L4 8.5l4.5-1.3z" />
      </>
    ),
    model: (
      <>
        <rect x="4" y="4" width="12" height="12" rx="3" />
        <path d="M7 1.8v2.1M13 1.8v2.1M7 16.1v2.1M13 16.1v2.1M1.8 7h2.1M16.1 7h2.1M1.8 13h2.1M16.1 13h2.1M8 8h4v4H8z" />
      </>
    ),
  }

  return (
    <svg className="settings-nav-icon" viewBox="0 0 20 20" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export default function SettingsWorkspace<Key extends string>({
  ariaLabel,
  active,
  groups,
  idPrefix,
  onSelect,
  children,
}: {
  ariaLabel: string
  active: Key
  groups: readonly SettingsNavGroup<Key>[]
  idPrefix: string
  onSelect: (key: Key) => void
  children: ReactNode
}) {
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups])

  useEffect(() => {
    const alignActiveTab = () => {
      const tab = document.getElementById(`${idPrefix}-tab-${active}`)
      const tabList = tab?.closest('[role="tablist"]')
      if (!(tab instanceof HTMLElement) || !(tabList instanceof HTMLElement)) return
      const tabRect = tab.getBoundingClientRect()
      const listRect = tabList.getBoundingClientRect()
      const left = tabRect.left - listRect.left + tabList.scrollLeft
      const right = left + tabRect.width
      const visibleLeft = tabList.scrollLeft
      const visibleRight = visibleLeft + tabList.clientWidth
      if (left < visibleLeft) tabList.scrollLeft = left
      else if (right > visibleRight) tabList.scrollLeft = right - tabList.clientWidth
    }

    const frame = requestAnimationFrame(alignActiveTab)
    window.addEventListener("resize", alignActiveTab)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", alignActiveTab)
    }
  }, [active, idPrefix])

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, current: Key) => {
    const currentIndex = items.findIndex((item) => item.key === current)
    let nextIndex: number | null = null
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (currentIndex + 1) % items.length
    if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + items.length) % items.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = items.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const next = items[nextIndex]
    onSelect(next.key)
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${next.key}`)?.focus())
  }

  return (
    <div className="settings-workspace">
      <nav className="settings-workspace-nav" aria-label={ariaLabel}>
        <div role="tablist" aria-orientation="vertical">
          {groups.map((group, groupIndex) => (
            <div className="settings-nav-group" role="presentation" key={group.label ?? groupIndex}>
              {group.label ? <p className="settings-nav-group-label">{group.label}</p> : null}
              {group.items.map((item) => (
                <Button
                  key={item.key}
                  type="button"
                  role="tab"
                  id={`${idPrefix}-tab-${item.key}`}
                  aria-controls={`${idPrefix}-panel`}
                  aria-selected={active === item.key}
                  tabIndex={active === item.key ? 0 : -1}
                  className={active === item.key ? "settings-nav-item is-selected" : "settings-nav-item"}
                  variant="quiet"
                  leadingIcon={<SettingsIcon name={item.icon} />}
                  onClick={() => onSelect(item.key)}
                  onKeyDown={(event) => moveFocus(event, item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <section
        id={`${idPrefix}-panel`}
        className="settings-workspace-panel"
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${active}`}
      >
        {children}
      </section>
    </div>
  )
}
