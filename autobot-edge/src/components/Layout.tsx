import type { FC } from 'hono/jsx'
import { Sidebar } from './Sidebar'

export const Layout: FC<{ title: string; currentPath: string; children: any }> = ({ title, currentPath, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        
        {/* PWA Manifest and Theme Colors */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0c0a14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        
        <title>{title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet" />
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

        <script dangerouslySetInnerHTML={{
          __html: `
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: { 
                  sans: ['Inter', 'system-ui', 'sans-serif'],
                  mono: ['JetBrains Mono', 'monospace']
                },
                colors: { 
                  base: '#0c0a14',
                  surface: '#13111c',
                  card: '#1a1726',
                  accent: '#f59e0b',
                  glass: 'rgba(255, 255, 255, 0.03)', 
                  glassBorder: 'rgba(255, 255, 255, 0.08)' 
                },
                animation: { 
                  'fade-in': 'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                },
                keyframes: { 
                  fadeIn: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
                  slideUp: { '0%': { opacity: 0, transform: 'translateY(16px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } }
                }
              }
            }
          }
          `
        }} />
        <style dangerouslySetInnerHTML={{
          __html: `
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          
          body { 
            background-color: #0c0a14; 
            color: #f1f5f9; 
            overflow: hidden;
            font-family: 'Inter', system-ui, sans-serif;
          }
          
          /* ===== Ambient Orbs — deeper, more cinematic ===== */
          .glow-orb-1 {
              position: fixed; top: -15%; right: -8%; width: 55vw; height: 55vh;
              background: radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%);
              filter: blur(100px); z-index: 0; pointer-events: none;
              animation: drift 25s ease-in-out infinite alternate;
          }
          .glow-orb-2 {
              position: fixed; bottom: -25%; left: -12%; width: 50vw; height: 50vh;
              background: radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%);
              filter: blur(120px); z-index: 0; pointer-events: none;
              animation: drift 30s ease-in-out infinite alternate-reverse;
          }
          .glow-orb-3 {
              position: fixed; top: 40%; left: 50%; width: 40vw; height: 40vh;
              background: radial-gradient(circle, rgba(14,165,233,0.04) 0%, transparent 70%);
              filter: blur(100px); z-index: 0; pointer-events: none;
              animation: drift 35s ease-in-out infinite alternate;
          }

          @keyframes drift {
              0% { transform: translate(0, 0) scale(1) rotate(0deg); }
              100% { transform: translate(-20px, 25px) scale(1.08) rotate(2deg); }
          }
          @keyframes fadeIn {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in { animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

          /* ===== Noise Texture Overlay ===== */
          body::after {
              content: '';
              position: fixed; inset: 0; z-index: 9999; pointer-events: none;
              opacity: 0.015;
              background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
              background-repeat: repeat;
          }

          /* ===== Premium Glass Cards ===== */
          .glass-panel {
              background: rgba(12, 10, 20, 0.92);
              backdrop-filter: blur(32px) saturate(1.2);
              -webkit-backdrop-filter: blur(32px) saturate(1.2);
              border-right: 1px solid rgba(255, 255, 255, 0.04);
              box-shadow: 4px 0 24px -4px rgba(0, 0, 0, 0.6);
          }
          .glass-card {
              background: linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
              backdrop-filter: blur(20px) saturate(1.1);
              -webkit-backdrop-filter: blur(20px) saturate(1.1);
              border: 1px solid rgba(255,255,255,0.06);
              box-shadow: 0 8px 32px -8px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.06);
              transition: border-color 0.3s ease, box-shadow 0.3s ease;
          }
          .glass-card:hover {
              border-color: rgba(255,255,255,0.1);
          }

          /* ===== Flash Animations (Real-Time) ===== */
          @keyframes flashProfit {
              0% { background-color: rgba(16, 185, 129, 0.6); box-shadow: 0 0 24px rgba(16, 185, 129, 0.5); }
              100% { background-color: transparent; box-shadow: none; }
          }
          @keyframes flashLoss {
              0% { background-color: rgba(239, 68, 68, 0.6); box-shadow: 0 0 24px rgba(239, 68, 68, 0.5); }
              100% { background-color: transparent; box-shadow: none; }
          }
          .flash-profit { animation: flashProfit 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .flash-loss { animation: flashLoss 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

          /* ===== Typography Glows ===== */
          .glow-green { text-shadow: 0 0 16px rgba(16, 185, 129, 0.35); }
          .glow-red { text-shadow: 0 0 16px rgba(239, 68, 68, 0.35); }
          .glow-amber { text-shadow: 0 0 16px rgba(245, 158, 11, 0.3); }

          /* ===== Scrollbar ===== */
          .custom-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
          .custom-scroll::-webkit-scrollbar-track { background: transparent; }
          .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
          .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

          /* ===== Sidebar Base ===== */
          #sidebar {
              position: relative;
              width: 15.5rem;
              height: 100%;
              transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
              flex-shrink: 0;
          }
          .sidebar-text { transition: opacity 0.25s, width 0.25s; white-space: nowrap; }
          
          #sidebar.sidebar-collapsed { width: 4.5rem; }
          #sidebar.sidebar-collapsed .sidebar-text { opacity: 0; width: 0; overflow: hidden; }
          #sidebar.sidebar-collapsed .sidebar-badge { opacity: 0; }

          /* ===== Sidebar: Mobile Drawer ===== */
          .sidebar-overlay {
              display: none;
              position: fixed; inset: 0;
              background: rgba(0, 0, 0, 0.7);
              backdrop-filter: blur(6px);
              -webkit-backdrop-filter: blur(6px);
              z-index: 30;
              opacity: 0;
              transition: opacity 0.3s ease;
          }
          .sidebar-overlay.active {
              display: block;
              opacity: 1;
          }

          @media (max-width: 767px) {
              #sidebar {
                  position: fixed !important;
                  left: 0; top: 0; bottom: 0;
                  width: 17rem;
                  z-index: 40;
                  transform: translateX(-100%);
              }
              #sidebar.mobile-open {
                  transform: translateX(0) !important;
              }
              #sidebar.sidebar-collapsed { width: 17rem; }
              #sidebar.sidebar-collapsed .sidebar-text { opacity: 1; width: auto; overflow: visible; }
          }


          /* ===== Table Scroll ===== */
          .table-scroll-container {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
          }

          /* ===== Touch Targets ===== */
          @media (max-width: 767px) {
              input, button, a { min-height: 44px; }
          }

          /* ===== Accent Gradient Border ===== */
          .accent-border {
              position: relative;
          }
          .accent-border::before {
              content: '';
              position: absolute; inset: -1px;
              border-radius: inherit;
              padding: 1px;
              background: linear-gradient(135deg, rgba(245,158,11,0.3), transparent 50%);
              -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              -webkit-mask-composite: xor;
              mask-composite: exclude;
              pointer-events: none;
          }

          /* ===== Status Indicator Pulse ===== */
          @keyframes statusPulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
              50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          }
          .status-dot-active {
              animation: statusPulse 2s ease-in-out infinite;
          }

          /* ===== Safe Area Padding for PWA ===== */
          @supports (padding-top: env(safe-area-inset-top)) {
              body { 
                  padding-top: env(safe-area-inset-top);
                  padding-bottom: env(safe-area-inset-bottom);
              }
          }
          `
        }} />
      </head>
      <body class="h-screen w-screen flex overflow-hidden antialiased selection:bg-amber-500/30">
        <div class="glow-orb-1"></div>
        <div class="glow-orb-2"></div>
        <div class="glow-orb-3"></div>
        
        <Sidebar currentPath={currentPath} />
        
        <main class="flex-1 min-w-0 h-full overflow-y-auto custom-scroll p-4 md:p-8 relative z-10">
          {children}
        </main>

        <script dangerouslySetInnerHTML={{
          __html: `
          // === Desktop sidebar collapse ===
          function toggleSidebar() {
              const sidebar = document.getElementById('sidebar');
              sidebar.classList.toggle('sidebar-collapsed');
          }

          // === Mobile sidebar drawer ===
          function openMobileSidebar() {
              const sidebar = document.getElementById('sidebar');
              const overlay = document.getElementById('sidebar-overlay');
              sidebar.classList.add('mobile-open');
              overlay.classList.add('active');
              document.body.style.overflow = 'hidden';
          }
          function closeMobileSidebar() {
              const sidebar = document.getElementById('sidebar');
              const overlay = document.getElementById('sidebar-overlay');
              sidebar.classList.remove('mobile-open');
              overlay.classList.remove('active');
              document.body.style.overflow = '';
          }

          // === Kill Switch ===
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

          // === Active sidebar link highlighting ===
          function updateActiveSidebarLink() {
              const path = window.location.pathname;
              const links = document.querySelectorAll('#sidebar nav a');
              links.forEach(link => {
                  const href = link.getAttribute('hx-get');
                  if (href === path) {
                      link.className = 'cursor-pointer flex items-center gap-3.5 px-4 py-2.5 rounded-xl transition-all group font-medium text-[13px] bg-white/[0.06] text-white border border-white/[0.08] shadow-[0_0_20px_rgba(255,255,255,0.03)]';
                  } else {
                      link.className = 'cursor-pointer flex items-center gap-3.5 px-4 py-2.5 rounded-xl transition-all group font-medium text-[13px] text-gray-500 hover:bg-white/[0.03] hover:text-gray-300 border border-transparent';
                  }
              });
          }

          document.body.addEventListener('htmx:afterSwap', updateActiveSidebarLink);
          updateActiveSidebarLink();

          // === Live clock ===
          function updateClock() {
              const el = document.getElementById('live-clock');
              if (el) {
                  const now = new Date();
                  el.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
              }
          }
          setInterval(updateClock, 1000);
          updateClock();

          // Close sidebar on escape key
          document.addEventListener('keydown', function(e) {
              if (e.key === 'Escape') closeMobileSidebar();
          });

          // Register PWA Service Worker
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').then((registration) => {
                console.log('ServiceWorker registered with scope:', registration.scope);
              }).catch((error) => {
                console.error('ServiceWorker registration failed:', error);
              });
            });
          }

          // Initialize the Telegram Mini App Bridge
          if (window.Telegram && window.Telegram.WebApp) {
              const tg = window.Telegram.WebApp;
              tg.expand();
              tg.ready();
              tg.setHeaderColor('#1a1020');
              tg.setBackgroundColor('#1a1020');
          }
          `
        }} />
      </body>
    </html>
  )
}
