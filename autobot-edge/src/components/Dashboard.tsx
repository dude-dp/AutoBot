import type { FC } from 'hono/jsx'
import { TopBar } from './TopBar'

export const Dashboard: FC<{ supabaseUrl: string; supabaseKey: string }> = ({ supabaseUrl, supabaseKey }) => {
  return (
    <div class="flex flex-col h-full animate-fade-in">
      <TopBar title="Live Terminal" />
      
      {/* Metrics Row */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div class="glass-card rounded-3xl p-6 relative overflow-hidden group hover:border-white/20 transition-all duration-300">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/20 mb-4">
                  <i class="fas fa-wallet text-emerald-400"></i>
              </div>
              <p class="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Available Capital</p>
              <h3 id="ui-capital" class="text-2xl font-bold font-mono text-gray-200">Loading...</h3>
          </div>
          <div class="glass-card rounded-3xl p-6 relative overflow-hidden hover:border-white/20 transition-all duration-300">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20 mb-4">
                  <i class="fas fa-crosshairs text-blue-400"></i>
              </div>
              <p class="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Win Rate</p>
              <h3 id="ui-winrate" class="text-2xl font-bold font-mono text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">...</h3>
          </div>
          <div class="glass-card rounded-3xl p-6 relative overflow-hidden hover:border-white/20 transition-all duration-300">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20 mb-4">
                  <i class="fas fa-bolt text-purple-400"></i>
              </div>
              <p class="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Executions</p>
              <h3 id="ui-trades" class="text-2xl font-bold font-mono text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]">...</h3>
          </div>
          
          {/* Accent Card for PnL */}
          <div id="pnl-card" class="rounded-3xl p-6 relative overflow-hidden bg-gradient-to-br from-orange-500/80 to-amber-600/80 border border-orange-400/50 shadow-[0_0_30px_rgba(245,158,11,0.2)] transform hover:-translate-y-1 transition-all duration-300">
              <div class="absolute -top-10 -right-10 w-32 h-32 bg-white/20 rounded-full blur-2xl"></div>
              <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md mb-4 border border-white/30">
                  <i class="fas fa-chart-line text-white"></i>
              </div>
              <p class="text-[11px] text-white/80 uppercase tracking-widest font-semibold mb-1">Net PnL</p>
              <h3 id="ui-pnl" class="text-3xl font-bold font-mono text-white drop-shadow-md">...</h3>
          </div>
      </div>

      {/* Main Chart Area */}
      <div class="glass-card rounded-3xl p-6 flex-1 flex flex-col min-h-[400px]">
          <div class="flex justify-between items-center border-b border-white/5 pb-4 mb-4">
              <h3 class="font-semibold text-gray-200 tracking-wide">Intraday Equity Curve</h3>
              <button onclick="analyzeDay()" class="text-[10px] uppercase tracking-wider bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-lg font-bold transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:scale-95">
                  <i class="fas fa-sparkles mr-1"></i> Edge AI Analysis
              </button>
          </div>
          
          <div id="ai-summary-box" class="hidden mb-5 p-4 bg-[#1a1020]/80 border-l-2 border-blue-500 rounded-r-xl text-sm text-blue-100 leading-relaxed shadow-inner backdrop-blur-md"></div>

          <div class="relative flex-1 w-full">
              <canvas id="mobileChart"></canvas>
          </div>
      </div>

      {/* 1. Securely pass Edge ENV variables to the client window */}
      <script dangerouslySetInnerHTML={{
        __html: `
          window.ENV = {
            SUPABASE_URL: "${supabaseUrl}",
            SUPABASE_KEY: "${supabaseKey}"
          };
        `
      }} />

      {/* 2. Load the new Real-Time Logic (Notice we use type="module") */}
      <script type="module" src="/static/dashboard-logic.js"></script>
    </div>
  )
}
