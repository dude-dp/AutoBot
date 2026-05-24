import type { FC } from 'hono/jsx'

export const Sidebar: FC<{ currentPath: string }> = ({ currentPath }) => {
  const getLinkClass = (path: string) => {
    const isActive = currentPath === path;
    const base = "cursor-pointer flex items-center gap-3.5 px-4 py-2.5 rounded-xl transition-all group font-medium text-[13px] ";
    return isActive 
      ? base + "bg-white/[0.06] text-white border border-white/[0.08] shadow-[0_0_20px_rgba(255,255,255,0.03)]" 
      : base + "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300 border border-transparent";
  };

  const getIconClass = (icon: string) => `fas fa-${icon} w-4 text-center text-[13px] transition-transform group-hover:scale-110 flex-shrink-0`;

  return (
    <>
      {/* Mobile Overlay */}
      <div id="sidebar-overlay" onclick="closeMobileSidebar()" class="sidebar-overlay"></div>

      <aside id="sidebar" class="sidebar-desktop glass-panel flex flex-col justify-between py-6 z-40">
        <div>
          {/* Brand */}
          <div class="flex items-center justify-between px-5 mb-8">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0 relative">
                <i class="fas fa-bolt text-black text-[11px]"></i>
              </div>
              <div class="sidebar-text">
                <span class="font-bold text-[15px] tracking-tight text-white">AutoBot</span>
                <span class="sidebar-badge block text-[9px] font-mono text-amber-500/70 tracking-widest uppercase -mt-0.5">Edge v2.0</span>
              </div>
            </div>
            {/* Desktop collapse */}
            <button onclick="toggleSidebar()" class="hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all" aria-label="Collapse sidebar">
              <i class="fas fa-chevron-left text-[10px]"></i>
            </button>
            {/* Mobile close */}
            <button onclick="closeMobileSidebar()" class="md:hidden text-gray-500 hover:text-white transition-colors p-1" aria-label="Close menu">
              <i class="fas fa-xmark text-lg"></i>
            </button>
          </div>

          {/* Section Label */}
          <div class="px-5 mb-3">
            <p class="sidebar-text text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em]">Navigation</p>
          </div>

          <nav class="flex flex-col gap-1 px-3">
            <a hx-get="/" hx-target="main" hx-push-url="true" onclick="closeMobileSidebar()" class={getLinkClass('/')}>
              <i class={getIconClass('layer-group')}></i>
              <span class="sidebar-text">Dashboard</span>
            </a>
            <a hx-get="/orders" hx-target="main" hx-push-url="true" onclick="closeMobileSidebar()" class={getLinkClass('/orders')}>
              <i class={getIconClass('receipt')}></i>
              <span class="sidebar-text">Orders</span>
            </a>
            <a hx-get="/statistics" hx-target="main" hx-push-url="true" onclick="closeMobileSidebar()" class={getLinkClass('/statistics')}>
              <i class={getIconClass('chart-mixed')}></i>
              <span class="sidebar-text">Statistics</span>
            </a>
            <a hx-get="/simulations" hx-target="main" hx-push-url="true" onclick="closeMobileSidebar()" class={getLinkClass('/simulations')}>
              <i class={getIconClass('flask-vial')}></i>
              <span class="sidebar-text">Simulations</span>
            </a>
          </nav>
        </div>

        {/* Bottom Area */}
        <div class="px-3 space-y-2">
          <div class="sidebar-text px-4 py-2">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 status-dot-active"></div>
              <span class="text-[10px] font-medium text-gray-500 uppercase tracking-wider">System Online</span>
            </div>
            <p id="live-clock" class="text-[11px] font-mono text-gray-600">--:--:--</p>
          </div>
          
          <button onclick="killSwitch()" class="w-full flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-gray-600 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all group cursor-pointer font-medium text-[13px]">
            <i class="fas fa-power-off w-4 text-center text-[13px] transition-transform group-hover:scale-110 flex-shrink-0"></i>
            <span class="sidebar-text">Kill Switch</span>
          </button>
        </div>
      </aside>
    </>
  )
}
