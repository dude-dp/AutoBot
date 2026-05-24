import type { FC } from 'hono/jsx'

export const TopBar: FC<{ title: string }> = ({ title }) => {
  return (
    <header class="flex justify-between items-center mb-8">
      <h2 class="text-2xl font-semibold tracking-tight text-white/90">{title}</h2>
      <div class="flex gap-3">
        <div id="sync-indicator" class="glass-card px-4 py-2 rounded-full flex items-center gap-2 text-sm transition-colors duration-300">
          <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_#4ade80]"></div>
          <span id="sync-text" class="text-gray-300 font-medium">Edge Synced</span>
        </div>
      </div>
    </header>
  )
}
