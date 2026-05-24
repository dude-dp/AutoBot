import type { FC } from 'hono/jsx'
import { TopBar } from './TopBar'

// Define the shape of your Supabase trade_log row
type Trade = {
  id: number
  trade_date: string
  time: string
  position_type: string
  buy_price: number
  sell_price: number
  pnl: number
}

export const Orders: FC<{ trades: Trade[] }> = ({ trades }) => {
  return (
    <div class="flex flex-col h-full animate-fade-in">
      <TopBar title="Execution History" />
      
      <div class="glass-card rounded-3xl p-6 flex-1 flex flex-col min-h-0">
        <div class="flex justify-between items-center mb-6">
          <h3 class="font-semibold text-gray-200">Last 100 Trades</h3>
          <span class="text-xs font-mono text-gray-500 bg-black/20 px-3 py-1 rounded-lg border border-white/5">Supabase Synced</span>
        </div>

        <div class="flex-1 overflow-y-auto custom-scroll pr-2">
          <table class="w-full text-sm text-left border-collapse">
            <thead class="text-gray-500 uppercase tracking-wider sticky top-0 bg-[#1a1020]/95 backdrop-blur z-10 text-xs">
              <tr>
                <th class="pb-4 font-semibold border-b border-white/5">Date / Time</th>
                <th class="pb-4 font-semibold border-b border-white/5">Contract</th>
                <th class="pb-4 font-semibold border-b border-white/5 text-right">Avg Entry</th>
                <th class="pb-4 font-semibold border-b border-white/5 text-right">Avg Exit</th>
                <th class="pb-4 font-semibold border-b border-white/5 text-right">Net PnL</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={5} class="py-12 text-center text-gray-500 italic">No executions found in database.</td>
                </tr>
              ) : (
                trades.map((t) => {
                  const isProfit = t.pnl >= 0;
                  const typeColor = t.position_type === 'CE' ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20';
                  const pnlColor = isProfit ? 'text-green-400 glow-green' : 'text-red-400 glow-red';
                  
                  return (
                    <tr class="hover:bg-white/5 transition-colors group">
                      <td class="py-3 text-gray-400 font-mono whitespace-nowrap">
                        <span class="text-gray-500 mr-2">{t.trade_date}</span>
                        <span class="text-gray-300">{t.time.substring(0, 8)}</span>
                      </td>
                      <td class="py-3">
                        <span class={`px-2 py-1 rounded text-xs font-bold border ${typeColor}`}>
                          {t.position_type}
                        </span>
                      </td>
                      <td class="py-3 font-mono text-gray-300 text-right">₹{t.buy_price.toFixed(2)}</td>
                      <td class="py-3 font-mono text-gray-300 text-right">₹{t.sell_price.toFixed(2)}</td>
                      <td class={`py-3 font-mono font-bold text-right ${pnlColor} group-hover:scale-105 transition-transform`}>
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
  )
}
