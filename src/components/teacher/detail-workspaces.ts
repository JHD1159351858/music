export function revealStackedAdminPanel(panel: HTMLElement | null) {
  if (window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches) {
    panel?.scrollIntoView({ block: 'start' })
  }
}
