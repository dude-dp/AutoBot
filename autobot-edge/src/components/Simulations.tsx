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
  return (
    <div class="flex flex-col h-full animate-fade-in">
      <TopBar title="Strategy Simulations" />

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-3 md:gap-6 flex-1 min-h-0">

        {/* Left Column: Parameter Configuration */}
        <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col relative overflow-hidden group">
          <div class="absolute -top-20 -left-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>

          <h3 class="font-semibold text-gray-200 mb-4 md:mb-6 flex items-center text-sm md:text-base">
            <i class="fas fa-sliders-h text-accent mr-2"></i> Engine Tuning
          </h3>

          <form class="space-y-4 md:space-y-5 flex-1 relative z-10">
            <div>
              <label class="block text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1.5 md:mb-2">Target Points</label>
              <input type="number" step="0.5" defaultValue="1.5" class="w-full bg-black/20 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/50 transition-colors" />
            </div>

            <div>
              <label class="block text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1.5 md:mb-2">Hard Stop Loss</label>
              <input type="number" step="0.5" defaultValue="2.0" class="w-full bg-black/20 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-white font-mono text-sm focus:outline-none focus:border-red-500/50 transition-colors" />
            </div>

            <div class="grid grid-cols-2 gap-3 md:gap-4">
              <div>
                <label class="block text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1.5 md:mb-2">Trail Trigger</label>
                <input type="number" step="0.5" defaultValue="2.5" class="w-full bg-black/20 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50 transition-colors" />
              </div>
              <div>
                <label class="block text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1.5 md:mb-2">Trail Dist</label>
                <input type="number" step="0.5" defaultValue="1.0" class="w-full bg-black/20 border border-white/10 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50 transition-colors" />
              </div>
            </div>

            <div class="pt-2 md:pt-4">
              <button type="button" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all active:scale-95 flex justify-center items-center gap-2 text-sm md:text-base">
                <i class="fas fa-play text-sm"></i> Run Simulation
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Leaderboard of Runs */}
        <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 xl:col-span-2 flex flex-col min-h-0">
          <div class="flex justify-between items-center mb-4 md:mb-6 gap-2">
            <h3 class="font-semibold text-gray-200 text-sm md:text-base">Historical Backtests</h3>
            <span class="text-[10px] md:text-xs font-mono text-gray-500 bg-black/20 px-2 md:px-3 py-1 rounded-lg border border-white/5 flex-shrink-0">Supabase Synced</span>
          </div>

          <div class="flex-1 overflow-y-auto custom-scroll">
            <div class="table-scroll-container">
              <table class="w-full text-sm text-left border-collapse min-w-[520px] md:min-w-0">
                <thead class="text-gray-500 uppercase tracking-wider sticky top-0 bg-[#1a1020]/95 backdrop-blur z-10 text-[9px] md:text-[10px]">
                  <tr>
                    <th class="pb-3 md:pb-4 font-semibold border-b border-white/5">Run Date</th>
                    <th class="pb-3 md:pb-4 font-semibold border-b border-white/5 text-center">Tgt / SL</th>
                    <th class="pb-3 md:pb-4 font-semibold border-b border-white/5 text-center">Trail</th>
                    <th class="pb-3 md:pb-4 font-semibold border-b border-white/5 text-right">Trades</th>
                    <th class="pb-3 md:pb-4 font-semibold border-b border-white/5 text-right">Win Rate</th>
                    <th class="pb-3 md:pb-4 font-semibold border-b border-white/5 text-right">Net PnL</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  {runs.length === 0 ? (
                    <tr>
                      <td colspan={6} class="py-12 text-center text-gray-500 italic text-xs md:text-sm">No simulations logged. Run your first backtest.</td>
                    </tr>
                  ) : (
                    runs.map((r) => {
                      const isProfit = r.net_pnl >= 0;
                      const pnlColor = isProfit ? 'text-green-400 glow-green' : 'text-red-400 glow-red';

                      return (
                        <tr class="hover:bg-white/5 transition-colors group cursor-pointer">
                          <td class="py-3 md:py-4 text-gray-400 font-mono whitespace-nowrap text-xs md:text-sm">
                            {r.date}
                          </td>
                          <td class="py-3 md:py-4 text-center font-mono text-xs md:text-sm">
                            <span class="text-green-400">{r.target.toFixed(1)}</span>
                            <span class="text-gray-600 mx-1">/</span>
                            <span class="text-red-400">{r.stop_loss.toFixed(1)}</span>
                          </td>
                          <td class="py-3 md:py-4 text-center font-mono text-gray-400 text-xs md:text-sm">
                            {r.trail_trigger.toFixed(1)} <span class="text-[10px] text-gray-600">({r.trail_dist.toFixed(1)})</span>
                          </td>
                          <td class="py-3 md:py-4 font-mono text-gray-300 text-right text-xs md:text-sm">{r.total_trades}</td>
                          <td class="py-3 md:py-4 font-mono text-blue-400 text-right text-xs md:text-sm">{r.win_rate}%</td>
                          <td class={`py-3 md:py-4 font-mono font-bold text-right text-xs md:text-sm ${pnlColor} group-hover:scale-105 transition-transform`}>
                            {isProfit ? '+' : ''}₹{Math.abs(r.net_pnl).toFixed(2)}
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
