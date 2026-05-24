import type { FC } from 'hono/jsx'
import { TopBar } from './TopBar'

type BacktestRun = {
  id: string
  date: string
  target: number
  stop_loss: number
  trail_trigger: number
  trail_dist: number
  total_trades: number
  win_rate: number
  net_pnl: number
}

export const Simulations: FC<{ runs: BacktestRun[] }> = ({ runs }) => {
  // Find best run
  const bestRun = runs.length > 0 ? runs.reduce((best, r) => r.net_pnl > best.net_pnl ? r : best, runs[0]) : null;
  const totalRuns = runs.length;
  const profitableRuns = runs.filter(r => r.net_pnl > 0).length;
  const avgPnl = totalRuns > 0 ? (runs.reduce((s, r) => s + r.net_pnl, 0) / totalRuns).toFixed(0) : '0';

  return (
    <div class="flex flex-col h-full animate-fade-in pb-4">
      <TopBar title="Strategy Simulations" />

      {/* Summary Stats */}
      <div class="flex flex-wrap gap-3 mb-4 md:mb-5">
        <div class="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center border border-violet-500/15">
            <i class="fas fa-flask-vial text-violet-400 text-[9px]"></i>
          </div>
          <div>
            <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold">Total Runs</p>
            <p class="text-sm font-bold font-mono text-gray-300">{totalRuns}</p>
          </div>
        </div>
        <div class="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center border border-emerald-500/15">
            <i class="fas fa-check text-emerald-400 text-[9px]"></i>
          </div>
          <div>
            <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold">Profitable</p>
            <p class="text-sm font-bold font-mono text-emerald-400">{profitableRuns}</p>
          </div>
        </div>
        <div class="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5">
          <div class={`w-6 h-6 rounded-md flex items-center justify-center border ${Number(avgPnl) >= 0 ? 'bg-emerald-500/10 border-emerald-500/15' : 'bg-red-500/10 border-red-500/15'}`}>
            <i class={`fas fa-chart-line text-[9px] ${Number(avgPnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}></i>
          </div>
          <div>
            <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold">Avg PnL</p>
            <p class={`text-sm font-bold font-mono ${Number(avgPnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>₹{avgPnl}</p>
          </div>
        </div>
        {bestRun && (
          <div class="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5 accent-border">
            <div class="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center border border-amber-500/15">
              <i class="fas fa-trophy text-amber-400 text-[9px]"></i>
            </div>
            <div>
              <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold">Best Run</p>
              <p class="text-sm font-bold font-mono text-amber-400">+₹{bestRun.net_pnl.toFixed(0)}</p>
            </div>
          </div>
        )}
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-3 md:gap-4 flex-1 min-h-0">

        {/* Left: Parameter Config */}
        <div class="glass-card rounded-2xl p-4 md:p-5 flex flex-col relative overflow-hidden">
          <div class="absolute -top-16 -left-16 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div class="border-b border-white/[0.04] pb-3 mb-4">
            <h3 class="font-semibold text-gray-300 flex items-center text-sm">
              <i class="fas fa-sliders text-amber-500/60 mr-2 text-xs"></i> Engine Tuning
            </h3>
            <p class="text-[10px] text-gray-600 mt-0.5">Configure backtest parameters</p>
          </div>

          <form class="space-y-4 flex-1 relative z-10">
            <div>
              <label class="block text-[9px] text-gray-500 uppercase tracking-widest font-semibold mb-1.5">Target Points</label>
              <input type="number" step="0.5" defaultValue="1.5" class="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500/30 transition-colors" />
            </div>

            <div>
              <label class="block text-[9px] text-gray-500 uppercase tracking-widest font-semibold mb-1.5">Hard Stop Loss</label>
              <input type="number" step="0.5" defaultValue="2.0" class="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-red-500/20 transition-colors" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[9px] text-gray-500 uppercase tracking-widest font-semibold mb-1.5">Trail Trigger</label>
                <input type="number" step="0.5" defaultValue="2.5" class="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500/20 transition-colors" />
              </div>
              <div>
                <label class="block text-[9px] text-gray-500 uppercase tracking-widest font-semibold mb-1.5">Trail Dist</label>
                <input type="number" step="0.5" defaultValue="1.0" class="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500/20 transition-colors" />
              </div>
            </div>

            <div class="pt-2">
              <button type="button" class="w-full bg-gradient-to-r from-amber-600/80 to-orange-600/80 hover:from-amber-500/80 hover:to-orange-500/80 text-white font-semibold py-2.5 px-4 rounded-xl shadow-[0_4px_20px_rgba(245,158,11,0.15)] transition-all active:scale-[0.98] flex justify-center items-center gap-2 text-sm border border-amber-400/20">
                <i class="fas fa-play text-[10px]"></i> Run Simulation
              </button>
            </div>
          </form>
        </div>

        {/* Right: Leaderboard */}
        <div class="glass-card rounded-2xl p-4 md:p-5 xl:col-span-2 flex flex-col min-h-0">
          <div class="flex justify-between items-center mb-4 gap-2 border-b border-white/[0.04] pb-3">
            <div>
              <h3 class="font-semibold text-gray-300 text-sm">Historical Backtests</h3>
              <p class="text-[10px] text-gray-600 mt-0.5">Ranked by Net PnL performance</p>
            </div>
            <span class="text-[9px] font-mono text-gray-600 bg-white/[0.03] px-2.5 py-1 rounded-lg border border-white/[0.04] flex-shrink-0 flex items-center gap-1.5">
              <div class="w-1 h-1 rounded-full bg-emerald-400"></div>
              Supabase
            </span>
          </div>

          <div class="flex-1 overflow-y-auto custom-scroll">
            <div class="table-scroll-container">
              <table class="w-full text-left border-collapse min-w-[520px] md:min-w-0">
                <thead class="text-gray-600 uppercase tracking-wider sticky top-0 bg-[#0c0a14]/95 backdrop-blur-sm z-10 text-[9px]">
                  <tr>
                    <th class="pb-3 font-semibold border-b border-white/[0.04]">Date</th>
                    <th class="pb-3 font-semibold border-b border-white/[0.04] text-center">Tgt / SL</th>
                    <th class="pb-3 font-semibold border-b border-white/[0.04] text-center">Trail</th>
                    <th class="pb-3 font-semibold border-b border-white/[0.04] text-right">Trades</th>
                    <th class="pb-3 font-semibold border-b border-white/[0.04] text-right">Win %</th>
                    <th class="pb-3 font-semibold border-b border-white/[0.04] text-right">Net PnL</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/[0.03]">
                  {runs.length === 0 ? (
                    <tr>
                      <td colspan={6} class="py-16 text-center">
                        <div class="flex flex-col items-center gap-3">
                          <div class="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center border border-white/[0.05]">
                            <i class="fas fa-flask text-gray-700 text-lg"></i>
                          </div>
                          <p class="text-gray-600 text-xs">No simulations logged yet</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    runs.map((r) => {
                      const isProfit = r.net_pnl >= 0;
                      const isBest = bestRun && r.id === bestRun.id;
                      const pnlColor = isProfit ? 'text-emerald-400' : 'text-red-400';
                      const rowBg = isBest ? 'bg-amber-500/[0.03] border-l-2 border-l-amber-500/30' : '';

                      return (
                        <tr class={`hover:bg-white/[0.02] transition-colors group ${rowBg}`}>
                          <td class="py-3 text-gray-500 font-mono whitespace-nowrap text-xs">
                            {isBest && <i class="fas fa-trophy text-amber-500/60 mr-1.5 text-[9px]"></i>}
                            {r.date}
                          </td>
                          <td class="py-3 text-center font-mono text-xs">
                            <span class="text-emerald-400/80">{r.target.toFixed(1)}</span>
                            <span class="text-gray-700 mx-1">/</span>
                            <span class="text-red-400/80">{r.stop_loss.toFixed(1)}</span>
                          </td>
                          <td class="py-3 text-center font-mono text-gray-500 text-xs">
                            {r.trail_trigger.toFixed(1)} <span class="text-gray-700">({r.trail_dist.toFixed(1)})</span>
                          </td>
                          <td class="py-3 font-mono text-gray-400 text-right text-xs">{r.total_trades}</td>
                          <td class="py-3 font-mono text-blue-400/80 text-right text-xs">{r.win_rate}%</td>
                          <td class={`py-3 font-mono font-bold text-right text-xs ${pnlColor}`}>
                            {isProfit ? '+' : ''}₹{Math.abs(r.net_pnl).toFixed(0)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
