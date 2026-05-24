import type { FC } from 'hono/jsx'
import { Sidebar } from './Sidebar'

export const Layout: FC<{ title: string; children: any }> = ({ title, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>{title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{
          __html: `
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: { sans: ['Inter', 'sans-serif'] },
                colors: { base: '#1a1020', glass: 'rgba(255, 255, 255, 0.03)', glassBorder: 'rgba(255, 255, 255, 0.08)' }
              }
            }
          }
          `
        }} />
        <style dangerouslySetInnerHTML={{
          __html: `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          body { background-color: #1a1020; color: #f8fafc; overflow: hidden; }
          .glow-orb-1 { position: absolute; top: -10%; right: -5%; width: 70vw; height: 70vh; background: radial-gradient(circle, rgba(245,158,11,0.25) 0%, rgba(217,119,6,0) 70%); filter: blur(80px); z-index: -1; }
          .glow-orb-2 { position: absolute; bottom: -20%; left: -10%; width: 60vw; height: 60vh; background: radial-gradient(circle, rgba(147,51,234,0.2) 0%, rgba(126,34,206,0) 70%); filter: blur(100px); z-index: -1; }
          .glass-panel { background: rgba(30, 20, 35, 0.4); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
          .glass-card { background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
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
        
        <Sidebar />
        
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
          `
        }} />
      </body>
    </html>
  )
}
