import type { FC } from 'hono/jsx'

export const Sidebar: FC = () => {
  return (
    <aside id="sidebar" class="w-64 h-full glass-panel flex flex-col justify-between py-6 relative z-20">
      <div>
        <div class="flex items-center justify-between px-6 mb-10">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-400 to-amber-300 flex items-center justify-center shadow-lg">
              <i class="fas fa-robot text-black text-sm"></i>
            </div>
            <span class="sidebar-text font-bold text-lg tracking-wide">AutoBot</span>
          </div>
          <button onclick="toggleSidebar()" class="text-gray-400 hover:text-white transition-colors">
            <i class="fas fa-bars"></i>
          </button>
        </div>

        <nav class="flex flex-col gap-2 px-3">
          <a href="/" class="flex items-center gap-4 px-3 py-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)] group">
            <i class="fas fa-layer-group w-5 text-center transition-transform group-hover:scale-110"></i>
            <span class="sidebar-text font-medium text-sm">Dashboard</span>
          </a>
          <a href="/orders" class="flex items-center gap-4 px-3 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group">
            <i class="fas fa-list-ul w-5 text-center transition-transform group-hover:scale-110"></i>
            <span class="sidebar-text font-medium text-sm">Orders</span>
          </a>
          <a href="/statistics" class="flex items-center gap-4 px-3 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group">
            <i class="fas fa-chart-pie w-5 text-center transition-transform group-hover:scale-110"></i>
            <span class="sidebar-text font-medium text-sm">Statistics</span>
          </a>
          <a href="/simulations" class="flex items-center gap-4 px-3 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group">
            <i class="fas fa-vial w-5 text-center transition-transform group-hover:scale-110"></i>
            <span class="sidebar-text font-medium text-sm">Simulations</span>
          </a>
        </nav>
      </div>

      <div class="px-3">
        <button onclick="killSwitch()" class="w-full flex items-center gap-4 px-3 py-3 rounded-xl text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all group cursor-pointer">
          <i class="fas fa-power-off w-5 text-center transition-transform group-hover:scale-110"></i>
          <span class="sidebar-text font-medium text-sm">Kill Switch</span>
        </button>
      </div>
    </aside>
  )
}
