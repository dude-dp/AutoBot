import type { FC } from 'hono/jsx'
import { TopBar } from './TopBar'

export const Dashboard: FC<{ supabaseUrl: string; supabaseKey: string }> = ({ supabaseUrl, supabaseKey }) => {
  return (
    <div class="flex flex-col h-full animate-fade-in">
      <TopBar title="Live Terminal" />
      
      {/* Metrics Row — 2 cols on mobile, 4 on desktop */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-6">
          <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 relative overflow-hidden group hover:border-white/20 transition-all duration-300">
              <div class="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/20 mb-3 md:mb-4">
                  <i class="fas fa-wallet text-emerald-400 text-xs md:text-base"></i>
              </div>
              <p class="text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Capital</p>
              <h3 id="ui-capital" class="text-lg md:text-2xl font-bold font-mono text-gray-200">Loading...</h3>
          </div>
          <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 relative overflow-hidden hover:border-white/20 transition-all duration-300">
              <div class="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-blue-400/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20 mb-3 md:mb-4">
                  <i class="fas fa-crosshairs text-blue-400 text-xs md:text-base"></i>
              </div>
              <p class="text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Win Rate</p>
              <h3 id="ui-winrate" class="text-lg md:text-2xl font-bold font-mono text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">...</h3>
          </div>
          <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 relative overflow-hidden hover:border-white/20 transition-all duration-300">
              <div class="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-purple-400/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20 mb-3 md:mb-4">
                  <i class="fas fa-bolt text-purple-400 text-xs md:text-base"></i>
              </div>
              <p class="text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Executions</p>
              <h3 id="ui-trades" class="text-lg md:text-2xl font-bold font-mono text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]">...</h3>
          </div>
          
          {/* Accent Card for PnL */}
          <div id="pnl-card" class="rounded-2xl md:rounded-3xl p-4 md:p-6 relative overflow-hidden bg-gradient-to-br from-orange-500/80 to-amber-600/80 border border-orange-400/50 shadow-[0_0_30px_rgba(245,158,11,0.2)] transform hover:-translate-y-1 transition-all duration-300">
              <div class="absolute -top-10 -right-10 w-24 h-24 md:w-32 md:h-32 bg-white/20 rounded-full blur-2xl"></div>
              <div class="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md mb-3 md:mb-4 border border-white/30">
                  <i class="fas fa-chart-line text-white text-xs md:text-base"></i>
              </div>
              <p class="text-[10px] md:text-[11px] text-white/80 uppercase tracking-widest font-semibold mb-1">Net PnL</p>
              <h3 id="ui-pnl" class="text-xl md:text-3xl font-bold font-mono text-white drop-shadow-md">...</h3>
          </div>
      </div>

      {/* Circuit Breaker / Risk Management Row */}
      <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 mb-4 md:mb-6 flex flex-col md:flex-row justify-between items-center relative overflow-hidden group border-red-500/10 gap-4">
          <div class="absolute -left-10 -bottom-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl"></div>
          
          <div class="flex items-center gap-4 z-10 w-full md:w-auto">
              <div id="status-icon-bg" class="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center border border-green-500/30 flex-shrink-0">
                  <i id="status-icon" class="fas fa-shield-alt text-green-400 text-lg"></i>
              </div>
              <div class="min-w-0">
                  <h3 class="font-bold text-gray-200 tracking-wide flex items-center gap-2 text-sm md:text-base">
                      System Status: <span id="ui-system-status" class="text-green-400 glow-green">ACTIVE</span>
                  </h3>
                  <p class="text-xs text-gray-400 mt-1">Autonomous circuit breakers armed.</p>
              </div>
          </div>

          <div class="flex flex-wrap items-end gap-3 z-10 w-full md:w-auto">
              <div class="flex flex-col flex-1 sm:flex-initial min-w-[120px]">
                  <label class="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Max Drawdown (₹)</label>
                  <input type="number" id="input-max-dd" class="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-white font-mono text-sm w-full sm:w-32 focus:outline-none focus:border-red-500/50" />
              </div>
              <div class="flex flex-col flex-1 sm:flex-initial min-w-[120px]">
                  <label class="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Max Consec Losses</label>
                  <input type="number" id="input-max-loss" class="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-white font-mono text-sm w-full sm:w-32 focus:outline-none focus:border-red-500/50" />
              </div>
              <button onclick="saveRiskConfig()" class="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-4 py-1.5 rounded-lg text-sm font-bold transition-all active:scale-95 flex-shrink-0">
                  Save
              </button>
          </div>
      </div>

      {/* Main Chart Area */}
      <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 flex-1 flex flex-col min-h-[280px] md:min-h-[400px]">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/5 pb-3 md:pb-4 mb-3 md:mb-4 gap-2">
              <h3 class="font-semibold text-gray-200 tracking-wide text-sm md:text-base">Intraday Equity Curve</h3>
              <button onclick="analyzeDay()" class="text-[10px] uppercase tracking-wider bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-lg font-bold transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:scale-95">
                  <i class="fas fa-sparkles mr-1"></i> Edge AI Analysis
              </button>
          </div>
          
          <div id="ai-summary-box" class="hidden mb-4 md:mb-5 p-3 md:p-4 bg-[#1a1020]/80 border-l-2 border-blue-500 rounded-r-xl text-xs md:text-sm text-blue-100 leading-relaxed shadow-inner backdrop-blur-md"></div>

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
