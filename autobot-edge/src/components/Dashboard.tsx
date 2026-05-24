import type { FC } from 'hono/jsx'
import { TopBar } from './TopBar'

export const Dashboard: FC<{ supabaseUrl: string; supabaseKey: string }> = ({ supabaseUrl, supabaseKey }) => {
  return (
    <div class="flex flex-col h-full animate-fade-in pb-4">
      <TopBar title="Live Terminal" />
      
      {/* Metrics Row — 2 cols on mobile, 4 on desktop */}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-5">
          {/* Capital */}
          <div class="glass-card rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:border-white/10 transition-all duration-300">
              <div class="flex items-center gap-2 mb-3">
                  <div class="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/15">
                      <i class="fas fa-wallet text-emerald-400 text-[10px]"></i>
                  </div>
                  <p class="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Capital</p>
              </div>
              <h3 id="ui-capital" class="text-lg md:text-xl font-bold font-mono text-gray-200">Loading...</h3>
          </div>
          
          {/* Win Rate */}
          <div class="glass-card rounded-2xl p-4 md:p-5 relative overflow-hidden hover:border-white/10 transition-all duration-300">
              <div class="flex items-center gap-2 mb-3">
                  <div class="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/15">
                      <i class="fas fa-crosshairs text-blue-400 text-[10px]"></i>
                  </div>
                  <p class="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Win Rate</p>
              </div>
              <h3 id="ui-winrate" class="text-lg md:text-xl font-bold font-mono text-blue-400">...</h3>
          </div>
          
          {/* Executions */}
          <div class="glass-card rounded-2xl p-4 md:p-5 relative overflow-hidden hover:border-white/10 transition-all duration-300">
              <div class="flex items-center gap-2 mb-3">
                  <div class="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center border border-violet-500/15">
                      <i class="fas fa-bolt text-violet-400 text-[10px]"></i>
                  </div>
                  <p class="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Executions</p>
              </div>
              <h3 id="ui-trades" class="text-lg md:text-xl font-bold font-mono text-violet-400">...</h3>
          </div>
          
          {/* Accent Card for PnL */}
          <div id="pnl-card" class="rounded-2xl p-4 md:p-5 relative overflow-hidden bg-gradient-to-br from-amber-500/90 to-orange-600/90 border border-amber-400/40 shadow-[0_4px_24px_rgba(245,158,11,0.15)] transition-all duration-300">
              <div class="absolute -top-8 -right-8 w-20 h-20 bg-white/10 rounded-full blur-2xl"></div>
              <div class="flex items-center gap-2 mb-3">
                  <div class="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
                      <i class="fas fa-chart-line text-white text-[10px]"></i>
                  </div>
                  <p class="text-[10px] text-white/70 uppercase tracking-widest font-semibold">Net PnL</p>
              </div>
              <h3 id="ui-pnl" class="text-xl md:text-2xl font-bold font-mono text-white">...</h3>
          </div>
      </div>

      {/* Circuit Breaker / Risk Management */}
      <div class="glass-card rounded-2xl p-4 md:p-5 mb-4 md:mb-5 flex flex-col md:flex-row justify-between items-center relative overflow-hidden gap-4">
          <div class="absolute -left-8 -bottom-8 w-28 h-28 bg-red-500/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div class="flex items-center gap-3 z-10 w-full md:w-auto">
              <div id="status-icon-bg" class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
                  <i id="status-icon" class="fas fa-shield-halved text-emerald-400 text-sm"></i>
              </div>
              <div class="min-w-0">
                  <h3 class="font-semibold text-gray-300 tracking-wide flex items-center gap-2 text-sm">
                      Status: <span id="ui-system-status" class="text-emerald-400 glow-green">ACTIVE</span>
                  </h3>
                  <p class="text-[10px] text-gray-600 mt-0.5">Autonomous circuit breakers armed</p>
              </div>
          </div>

          <div class="flex flex-wrap items-end gap-3 z-10 w-full md:w-auto">
              <div class="flex flex-col flex-1 sm:flex-initial min-w-[100px]">
                  <label class="text-[9px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Max DD (₹)</label>
                  <input type="number" id="input-max-dd" class="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 text-white font-mono text-xs w-full sm:w-28 focus:outline-none focus:border-amber-500/30 transition-colors" />
              </div>
              <div class="flex flex-col flex-1 sm:flex-initial min-w-[100px]">
                  <label class="text-[9px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Max Losses</label>
                  <input type="number" id="input-max-loss" class="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 text-white font-mono text-xs w-full sm:w-28 focus:outline-none focus:border-amber-500/30 transition-colors" />
              </div>
              <button onclick="saveRiskConfig()" class="bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white border border-white/[0.06] px-4 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 flex-shrink-0">
                  Apply
              </button>
          </div>
      </div>

      {/* Main Content Grid: Equity Curve & OBI Radar */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-5">
          {/* Equity Curve (2/3) */}
          <div class="glass-card rounded-2xl p-4 md:p-5 lg:col-span-2 flex flex-col min-h-[280px] md:min-h-[380px]">
              <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/[0.04] pb-3 mb-3 gap-2">
                  <div>
                      <h3 class="font-semibold text-gray-300 text-sm">Intraday Equity Curve</h3>
                      <p class="text-[10px] text-gray-600 mt-0.5">Cumulative P&amp;L over today's session</p>
                  </div>
                  <button onclick="analyzeDay()" class="text-[10px] uppercase tracking-wider bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg font-semibold transition-all active:scale-95">
                      <i class="fas fa-wand-magic-sparkles mr-1"></i> AI Analysis
                  </button>
              </div>
              
              <div id="ai-summary-box" class="hidden mb-3 p-3 bg-blue-500/[0.04] border border-blue-500/10 rounded-xl text-xs text-blue-200/80 leading-relaxed"></div>

              <div class="relative flex-1 w-full min-h-[180px] md:min-h-[260px]">
                  <canvas id="mobileChart"></canvas>
              </div>
          </div>

          {/* Live OBI Radar (1/3) */}
          <div class="glass-card rounded-2xl p-4 md:p-5 flex flex-col relative overflow-hidden min-h-[280px] md:min-h-[380px]">
              <div class="absolute -right-20 -bottom-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div class="flex justify-between items-center border-b border-white/[0.04] pb-3 mb-3 z-10">
                  <h3 class="font-semibold text-gray-300 text-sm flex items-center">
                      <i class="fas fa-satellite-dish text-blue-400 mr-2 animate-pulse"></i> OBI Radar
                  </h3>
                  <span id="macro-trend-badge" class="px-2 py-0.5 rounded bg-white/5 text-[9px] font-bold tracking-wider text-gray-400 border border-white/[0.04]">SCANNING</span>
              </div>
              
              <div class="flex-1 flex flex-col justify-around z-10 gap-2">
                  {/* CE Momentum Gauge */}
                  <div class="relative w-full h-28 flex flex-col items-center">
                      <p class="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Call (CE) Momentum</p>
                      <div class="relative w-full flex-1"><canvas id="ceGauge"></canvas></div>
                      <div class="absolute bottom-0 text-center">
                          <span id="ce-ratio" class="text-xl md:text-2xl font-bold font-mono text-gray-200">0.00x</span>
                          <p id="ce-spread" class="text-[9px] text-gray-500 font-mono mt-0.5">Spread: ₹0.0</p>
                      </div>
                  </div>
                  
                  <div class="w-full h-px bg-white/5 my-2"></div>
                  
                  {/* PE Momentum Gauge */}
                  <div class="relative w-full h-28 flex flex-col items-center">
                      <p class="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Put (PE) Momentum</p>
                      <div class="relative w-full flex-1"><canvas id="peGauge"></canvas></div>
                      <div class="absolute bottom-0 text-center">
                          <span id="pe-ratio" class="text-xl md:text-2xl font-bold font-mono text-gray-200">0.00x</span>
                          <p id="pe-spread" class="text-[9px] text-gray-500 font-mono mt-0.5">Spread: ₹0.0</p>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Live Trade Feed Row */}
      <div class="glass-card rounded-2xl p-4 md:p-5 flex flex-col min-h-[220px] mb-4 md:mb-5">
          <div class="flex justify-between items-center border-b border-white/[0.04] pb-3 mb-3">
              <h3 class="font-semibold text-gray-300 text-sm">Live Feed</h3>
              <div class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 status-dot-active"></div>
                  <span class="text-[10px] text-gray-600 font-medium">REALTIME</span>
              </div>
          </div>
          <div id="trades-container" class="flex-1 overflow-y-auto custom-scroll space-y-1">
              <div class="flex items-center justify-center h-full text-gray-600 text-xs italic">Waiting for executions...</div>
          </div>
      </div>

      {/* Inject ENV */}
      <script dangerouslySetInnerHTML={{
        __html: `
          window.ENV = {
            SUPABASE_URL: "${supabaseUrl}",
            SUPABASE_KEY: "${supabaseKey}"
          };
        `
      }} />

      <script type="module" src="/static/dashboard-logic.js"></script>
    </div>
  )
}
