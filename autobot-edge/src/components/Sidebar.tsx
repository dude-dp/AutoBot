import type { FC } from 'hono/jsx'

export const Sidebar: FC<{ currentPath: string }> = ({ currentPath }) => {
  // Helper to determine active styling
  const getLinkClass = (path: string) => {
    const isActive = currentPath === path;
    const base = "cursor-pointer flex items-center gap-4 px-4 py-3 rounded-2xl transition-all group font-medium text-sm ";
    return isActive 
      ? base + "bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]" 
      : base + "text-gray-400 hover:bg-white/5 hover:text-white border border-transparent";
  };

  return (
    <aside id="sidebar" class="w-64 h-full glass-panel flex flex-col justify-between py-8 relative z-20">
      <div>
        <div class="flex items-center justify-between px-8 mb-12">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-400 to-amber-300 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <i class="fas fa-robot text-black text-sm"></i>
            </div>
            <span class="sidebar-text font-bold text-xl tracking-tight text-white">AutoBot</span>
          </div>
          <button onclick="toggleSidebar()" class="text-gray-400 hover:text-white transition-colors">
            <i class="fas fa-bars"></i>
          </button>
        </div>

        <nav class="flex flex-col gap-2 px-4">
          <a hx-get="/" hx-target="main" hx-push-url="true" class={getLinkClass('/')}>
            <i class="fas fa-layer-group w-5 text-center transition-transform group-hover:scale-110"></i>
            <span class="sidebar-text">Dashboard</span>
          </a>
          <a hx-get="/orders" hx-target="main" hx-push-url="true" class={getLinkClass('/orders')}>
            <i class="fas fa-list-ul w-5 text-center transition-transform group-hover:scale-110"></i>
            <span class="sidebar-text">Orders</span>
          </a>
          <a hx-get="/statistics" hx-target="main" hx-push-url="true" class={getLinkClass('/statistics')}>
            <i class="fas fa-chart-pie w-5 text-center transition-transform group-hover:scale-110"></i>
            <span class="sidebar-text">Statistics</span>
          </a>
          <a hx-get="/simulations" hx-target="main" hx-push-url="true" class={getLinkClass('/simulations')}>
            <i class="fas fa-vial w-5 text-center transition-transform group-hover:scale-110"></i>
            <span class="sidebar-text">Simulations</span>
          </a>
        </nav>
      </div>

      <div class="px-4">
        <button onclick="killSwitch()" class="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-gray-400 hover:bg-red-500/20 hover:text-red-400 border border-transparent transition-all group cursor-pointer font-medium text-sm">
          <i class="fas fa-power-off w-5 text-center transition-transform group-hover:scale-110"></i>
          <span class="sidebar-text">Kill Switch</span>
        </button>
      </div>
    </aside>
  )
}
