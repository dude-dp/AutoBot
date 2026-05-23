import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  // 1. Initialize Supabase
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)

  // 2. Fetch Today's Trades
  const today = new Date().toISOString().split('T')[0]
  const { data: trades, error } = await supabase
    .from('trade_log')
    .select('*')
    .eq('trade_date', today)
    .order('id', { ascending: false })

  // 3. Calculate Live Stats
  const totalTrades = trades?.length || 0
  const dailyPnL = trades?.reduce((sum, trade) => sum + (trade.pnl || 0), 0) || 0
  const wins = trades?.filter(t => t.pnl > 0).length || 0
  const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0

  // 4. Render the UI
  return c.html(
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>AutoBot Edge</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          {`tailwind.config = {
            theme: {
              extend: {
                colors: { dark: '#301934', card: '#1e293b', accent: '#3b82f6' }
              }
            }
          }`}
        </script>
        <style>
          {`body { background-color: #301934; color: #f8fafc; font-family: 'Inter', sans-serif; }`}
        </style>
      </head>
      <body class="p-4 md:p-8">
        <div class="max-w-3xl mx-auto space-y-6">
          <header class="p-6 rounded-2xl border border-white/10 bg-black/40 backdrop-blur">
            <h1 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
              AutoBot Mobile Edge
            </h1>
          </header>

          <div class="grid grid-cols-2 gap-4">
            <div class="p-4 rounded-xl border border-white/10 bg-black/40 text-center">
              <p class="text-xs text-gray-400 uppercase">Net PnL</p>
              <p class={`text-3xl font-mono font-bold mt-2 ${dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{dailyPnL.toFixed(2)}
              </p>
            </div>
            <div class="p-4 rounded-xl border border-white/10 bg-black/40 text-center">
              <p class="text-xs text-gray-400 uppercase">Win Rate</p>
              <p class="text-3xl font-mono font-bold mt-2 text-blue-400">{winRate}%</p>
            </div>
          </div>

          <div class="mt-8">
            <h2 class="text-xl font-bold mb-4">Recent Trades</h2>
            <div class="space-y-3">
              {trades && trades.length > 0 ? (
                trades.map((t) => (
                  <div key={t.id} class="p-4 rounded-xl border border-white/10 bg-black/20 flex justify-between items-center">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class={`font-bold ${t.position_type === 'CE' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.position_type}
                        </span>
                        <span class="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{t.time}</span>
                      </div>
                      <div class="text-sm text-gray-300 mt-1">
                        In: ₹{t.buy_price} → Out: ₹{t.sell_price}
                      </div>
                    </div>
                    <div class={`font-mono font-bold text-lg ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {t.pnl >= 0 ? '+' : ''}₹{t.pnl.toFixed(2)}
                    </div>
                  </div>
                ))
              ) : (
                <div class="text-center py-8 text-gray-500 bg-black/20 rounded-xl border border-white/10">
                  <p>No trades logged today.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </body>
    </html>
  )
})

export default app
