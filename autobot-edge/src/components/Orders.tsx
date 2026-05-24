import type { FC } from 'hono/jsx'
import { TopBar } from './TopBar'

type Trade = {
  id: number
  trade_date: string
  time: string
  position_type: string
  buy_price: number
  sell_price: number
  pnl: number
  ai_tag?: string
}

export const Orders: FC<{ trades: Trade[] }> = ({ trades }) => {
  // Compute summary stats
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const wins = trades.filter(t => t.pnl > 0).length
  const losses = trades.filter(t => t.pnl < 0).length
  const isProfit = totalPnl >= 0

  return (
    <div class="flex flex-col h-full animate-fade-in pb-4">
      <TopBar title="Execution History" />

      {/* Quick Stats Strip */}
      <div class="flex flex-wrap gap-3 mb-4 md:mb-5">
        <div class="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center border border-violet-500/15">
            <i class="fas fa-list text-violet-400 text-[9px]"></i>
          </div>
          <div>
            <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold">Showing</p>
            <p class="text-sm font-bold font-mono text-gray-300">{trades.length}</p>
          </div>
        </div>
        <div class="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center border border-emerald-500/15">
            <i class="fas fa-check text-emerald-400 text-[9px]"></i>
          </div>
          <div>
            <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold">Wins</p>
            <p class="text-sm font-bold font-mono text-emerald-400">{wins}</p>
          </div>
        </div>
        <div class="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center border border-red-500/15">
            <i class="fas fa-xmark text-red-400 text-[9px]"></i>
          </div>
          <div>
            <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold">Losses</p>
            <p class="text-sm font-bold font-mono text-red-400">{losses}</p>
          </div>
        </div>
        <div class="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2.5">
          <div class={`w-6 h-6 rounded-md flex items-center justify-center border ${isProfit ? 'bg-emerald-500/10 border-emerald-500/15' : 'bg-red-500/10 border-red-500/15'}`}>
            <i class={`fas fa-indian-rupee-sign text-[9px] ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}></i>
          </div>
          <div>
            <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold">Net PnL</p>
            <p class={`text-sm font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
              {isProfit ? '+' : ''}₹{Math.abs(totalPnl).toFixed(0)}
            </p>
          </div>
        </div>
      </div>

      <div class="glass-card rounded-2xl p-4 md:p-5 flex-1 flex flex-col min-h-0">
        <div class="flex justify-between items-center mb-4 gap-2 border-b border-white/[0.04] pb-3">
          <h3 class="font-semibold text-gray-300 text-sm">Trade Log</h3>
          <span class="text-[9px] font-mono text-gray-600 bg-white/[0.03] px-2.5 py-1 rounded-lg border border-white/[0.04] flex-shrink-0 flex items-center gap-1.5">
            <div class="w-1 h-1 rounded-full bg-emerald-400"></div>
            Supabase
          </span>
        </div>

        <div class="flex-1 overflow-y-auto custom-scroll">
          <div class="table-scroll-container">
            <table class="w-full text-left border-collapse min-w-[480px] md:min-w-0">
              <thead class="text-gray-600 uppercase tracking-wider sticky top-0 bg-[#0c0a14]/95 backdrop-blur-sm z-10 text-[9px]">
                <tr>
                  <th class="pb-3 font-semibold border-b border-white/[0.04] pl-2">#</th>
                  <th class="pb-3 font-semibold border-b border-white/[0.04]">Date / Time</th>
                  <th class="pb-3 font-semibold border-b border-white/[0.04]">Type</th>
                  <th class="pb-3 font-semibold border-b border-white/[0.04]">AI Tag</th>
                  <th class="pb-3 font-semibold border-b border-white/[0.04] text-right">Entry</th>
                  <th class="pb-3 font-semibold border-b border-white/[0.04] text-right">Exit</th>
                  <th class="pb-3 font-semibold border-b border-white/[0.04] text-right pr-2">PnL</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/[0.03]">
                {trades.length === 0 ? (
                  <tr>
                    <td colSpan={7} class="py-16 text-center">
                      <div class="flex flex-col items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center border border-white/[0.05]">
                          <i class="fas fa-inbox text-gray-700 text-lg"></i>
                        </div>
                        <p class="text-gray-600 text-xs">No executions found in database</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  trades.map((t, idx) => {
                    const isProfit = t.pnl >= 0;
                    const typeColor = t.position_type === 'CE' 
                      ? 'text-emerald-400 bg-emerald-400/[0.06] border-emerald-400/[0.1]' 
                      : 'text-red-400 bg-red-400/[0.06] border-red-400/[0.1]';
                    const pnlColor = isProfit ? 'text-emerald-400' : 'text-red-400';

                    return (
                      <tr class="hover:bg-white/[0.02] transition-colors group">
                        <td class="py-2.5 pl-2 text-gray-700 font-mono text-[10px]">{idx + 1}</td>
                        <td class="py-2.5 text-gray-400 font-mono whitespace-nowrap text-xs">
                          <span class="text-gray-600">{t.trade_date}</span>
                          <span class="text-gray-500 ml-1.5">{t.time.substring(0, 8)}</span>
                        </td>
                        <td class="py-2.5">
                          <span class={`px-2 py-0.5 rounded text-[10px] font-bold border ${typeColor}`}>
                            {t.position_type}
                          </span>
                        </td>
                        <td class="py-2.5">
                          {t.ai_tag ? (
                            <span class={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              t.ai_tag === 'BREAKOUT' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                              t.ai_tag === 'REVERSION' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                              t.ai_tag === 'CHOP' ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' :
                              t.ai_tag === 'STOP_HUNT' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                              'bg-white/5 text-gray-500 border-white/10'
                            }`}>
                              {t.ai_tag === 'BREAKOUT' ? '🔥 BREAKOUT' :
                               t.ai_tag === 'REVERSION' ? '⚖️ REVERSION' :
                               t.ai_tag === 'CHOP' ? '✂️ CHOP' :
                               t.ai_tag === 'STOP_HUNT' ? '🩸 STOP_HUNT' :
                               `⚙️ ${t.ai_tag}`}
                            </span>
                          ) : (
                            <span class="text-[10px] text-gray-600 font-mono italic">None</span>
                          )}
                        </td>
                        <td class="py-2.5 font-mono text-gray-400 text-right text-xs">₹{t.buy_price.toFixed(2)}</td>
                        <td class="py-2.5 font-mono text-gray-400 text-right text-xs">₹{t.sell_price.toFixed(2)}</td>
                        <td class={`py-2.5 font-mono font-bold text-right text-xs pr-2 ${pnlColor}`}>
                          {isProfit ? '+' : ''}₹{Math.abs(t.pnl).toFixed(2)}
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
  )
}
