import type { FC } from 'hono/jsx'

export const TopBar: FC<{ title: string }> = ({ title }) => {
  return (
    <header class="flex justify-between items-center mb-6 md:mb-8 gap-3">
      {/* Mobile hamburger */}
      <button onclick="openMobileSidebar()" class="md:hidden glass-card p-2.5 rounded-xl text-gray-300 hover:text-white transition-colors flex-shrink-0 active:scale-95" aria-label="Open menu">
        <i class="fas fa-bars text-base"></i>
      </button>

      <h2 class="text-lg md:text-2xl font-semibold tracking-tight text-white/90 truncate">{title}</h2>

      <div class="flex gap-2 flex-shrink-0">
        <div id="sync-indicator" class="glass-card px-3 py-1.5 md:px-4 md:py-2 rounded-full flex items-center gap-2 text-xs md:text-sm transition-colors duration-300">
          <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_#4ade80]"></div>
          <span id="sync-text" class="text-gray-300 font-medium hidden sm:inline">Edge Synced</span>
        </div>
      </div>
    </header>
  )
}
