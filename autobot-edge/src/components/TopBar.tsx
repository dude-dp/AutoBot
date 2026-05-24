import type { FC } from 'hono/jsx'

export const TopBar: FC<{ title: string }> = ({ title }) => {
  return (
    <header class="flex justify-between items-center mb-6 md:mb-8 gap-3">
      {/* Mobile hamburger */}
      <button onclick="openMobileSidebar()" class="md:hidden glass-card p-2.5 rounded-xl text-gray-400 hover:text-white transition-colors flex-shrink-0 active:scale-95" aria-label="Open menu">
        <i class="fas fa-bars text-sm"></i>
      </button>

      <div class="flex items-center gap-3 min-w-0">
        <h2 class="text-base md:text-xl font-semibold tracking-tight text-white/90 truncate">{title}</h2>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        {/* Sync Status */}
        <div id="sync-indicator" class="glass-card px-3 py-1.5 md:px-3.5 md:py-1.5 rounded-full flex items-center gap-2 text-[11px] md:text-xs transition-colors duration-300">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 status-dot-active"></div>
          <span id="sync-text" class="text-gray-400 font-medium hidden sm:inline">Edge Synced</span>
        </div>
      </div>
    </header>
  )
}
