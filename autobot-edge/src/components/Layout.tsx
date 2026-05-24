import type { FC } from 'hono/jsx'
import { Sidebar } from './Sidebar'

export const Layout: FC<{ title: string; currentPath: string; children: any }> = ({ title, currentPath, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>{title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{
          __html: `
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: { sans: ['Inter', 'sans-serif'] },
                colors: { base: '#1a1020', glass: 'rgba(255, 255, 255, 0.03)', glassBorder: 'rgba(255, 255, 255, 0.08)' },
                animation: { 'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' },
                keyframes: { fadeIn: { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } } }
              }
            }
          }
          `
        }} />
        <style dangerouslySetInnerHTML={{
          __html: `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          body { background-color: #1a1020; color: #f8fafc; overflow: hidden; }
          
          /* Ambient Liquid Backgrounds */
          .glow-orb-1 {
              position: fixed; top: -10%; right: -5%; width: 70vw; height: 70vh;
              background: radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0) 70%);
              filter: blur(90px); z-index: -1;
              animation: float 20s ease-in-out infinite alternate;
          }
          .glow-orb-2 {
              position: fixed; bottom: -20%; left: -10%; width: 60vw; height: 60vh;
              background: radial-gradient(circle, rgba(147,51,234,0.12) 0%, rgba(126,34,206,0) 70%);
              filter: blur(100px); z-index: -1;
              animation: float 25s ease-in-out infinite alternate-reverse;
          }

          @keyframes float {
              0% { transform: translate(0, 0) scale(1); }
              100% { transform: translate(-30px, 30px) scale(1.1); }
          }

          @keyframes fadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

          /* Premium Glass Cards */
          .glass-panel {
              background: rgba(26, 16, 32, 0.6);
              backdrop-filter: blur(28px);
              -webkit-backdrop-filter: blur(28px);
              border-right: 1px solid rgba(255, 255, 255, 0.05);
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          }
          .glass-card {
              background: linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%);
              backdrop-filter: blur(20px);
              border: 1px solid rgba(255,255,255,0.08);
              box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.1);
          }

          /* Flash animations for Real-Time execution */
          @keyframes flashProfit {
              0% { background-color: rgba(16, 185, 129, 0.8); box-shadow: 0 0 30px rgba(16, 185, 129, 0.8); transform: scale(1.02); }
              100% { background-color: transparent; box-shadow: none; transform: scale(1); }
          }
          @keyframes flashLoss {
              0% { background-color: rgba(239, 68, 68, 0.8); box-shadow: 0 0 30px rgba(239, 68, 68, 0.8); transform: scale(1.02); }
              100% { background-color: transparent; box-shadow: none; transform: scale(1); }
          }

          .flash-profit { animation: flashProfit 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .flash-loss { animation: flashLoss 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

          /* Typography Glows */
          .glow-green { text-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
          .glow-red { text-shadow: 0 0 20px rgba(239, 68, 68, 0.4); }

          #sidebar { transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
          .sidebar-text { transition: opacity 0.2s, width 0.2s; white-space: nowrap; }
          .sidebar-collapsed { width: 5rem; }
          .sidebar-collapsed .sidebar-text { opacity: 0; width: 0; overflow: hidden; }
          .custom-scroll::-webkit-scrollbar { width: 6px; }
          .custom-scroll::-webkit-scrollbar-track { background: transparent; }
          .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
          `
        }} />
      </head>
      <body class="h-screen w-screen flex antialiased selection:bg-orange-500/30">
        <div class="glow-orb-1"></div>
        <div class="glow-orb-2"></div>
        
        <Sidebar currentPath={currentPath} />
        
        <main class="flex-1 h-full overflow-y-auto custom-scroll p-4 md:p-8 relative z-10">
          {children}
        </main>

        <script dangerouslySetInnerHTML={{
          __html: `
          function toggleSidebar() {
              const sidebar = document.getElementById('sidebar');
              sidebar.classList.toggle('sidebar-collapsed');
          }

          async function killSwitch() {
              if (confirm("🚨 WARNING: Market-sell open positions and halt the local engine. Proceed?")) {
                  try {
                      await fetch('/api/panic', { method: 'POST' });
                      alert("Panic signal sent to edge database.");
                  } catch (e) {
                      alert("Failed to reach edge database.");
                  }
              }
          }

          function updateActiveSidebarLink() {
              const path = window.location.pathname;
              const links = document.querySelectorAll('#sidebar nav a');
              links.forEach(link => {
                  const href = link.getAttribute('hx-get');
                  if (href === path) {
                      link.className = 'cursor-pointer flex items-center gap-4 px-4 py-3 rounded-2xl transition-all group font-medium text-sm bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]';
                  } else {
                      link.className = 'cursor-pointer flex items-center gap-4 px-4 py-3 rounded-2xl transition-all group font-medium text-sm text-gray-400 hover:bg-white/5 hover:text-white border border-transparent';
                  }
              });
          }

          document.body.addEventListener('htmx:afterSwap', updateActiveSidebarLink);
          // Run immediately
          updateActiveSidebarLink();
          `
        }} />
      </body>
    </html>
  )
}
