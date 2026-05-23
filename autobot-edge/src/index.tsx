import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const today = new Date().toISOString().split('T')[0]

  // Fetch today's trades (Ordered ascending to build the chart curve)
  const { data: trades, error } = await supabase
    .from('trade_log')
    .select('*')
    .eq('trade_date', today)
    .order('id', { ascending: true })

  // Calculate Stats
  const totalTrades = trades?.length || 0
  const wins = trades?.filter(t => t.pnl > 0).length || 0
  const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0
  const dailyPnL = trades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0

  // Build Intraday Chart Data
  let cumulative = 0;
  const chartLabels = trades?.map(t => t.time.substring(0, 5)) || []; // HH:MM
  const chartData = trades?.map(t => {
      cumulative += (t.pnl || 0);
      return cumulative.toFixed(2);
  }) || [];

  // Reverse trades for the table so newest is at the top
  const tableTrades = trades ? [...trades].reverse() : [];

  return c.html(
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>AutoBot Edge</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{
          __html: `
          tailwind.config = {
            theme: {
              extend: {
                colors: { dark: '#301934', card: '#1e293b', accent: '#3b82f6' }
              }
            }
          }
          `
        }} />
        <style dangerouslySetInnerHTML={{
          __html: `
          body { background-color: #301934; color: #f8fafc; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
          .glass { background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
          `
        }} />
      </head>
      <body class="p-3 md:p-6 pb-20">
        <div class="max-w-2xl mx-auto space-y-5">
          
          {/* Header */}
          <header class="flex justify-between items-center glass p-5 rounded-2xl shadow-xl">
            <div>
              <h1 class="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                <i class="fas fa-robot mr-2"></i>AutoBot Edge
              </h1>
              <p class="text-xs text-gray-400 mt-1">{new Date().toDateString()}</p>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center px-3 py-1 rounded-full font-bold bg-green-900/50 text-green-400 border border-green-500/30 text-xs shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <div class="w-1.5 h-1.5 rounded-full bg-green-400 mr-2 animate-pulse"></div>
                  SYNCED
              </div>
              <button onclick="killSwitch()" class="flex items-center px-3 py-1 rounded-full font-bold bg-red-900/50 text-red-400 border border-red-500/30 text-xs shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:bg-red-600 hover:text-white transition-colors">
                  <i class="fas fa-skull-crossbones mr-1"></i> PANIC
              </button>
            </div>
          </header>

          {/* Top Stats Grid */}
          <div class="grid grid-cols-3 gap-3">
            <div class="glass p-4 rounded-2xl text-center shadow-lg">
              <p class="text-[10px] text-gray-400 uppercase tracking-wider">Net PnL</p>
              <p class={`text-lg font-bold font-mono mt-1 ${dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{dailyPnL.toFixed(2)}
              </p>
            </div>
            <div class="glass p-4 rounded-2xl text-center shadow-lg">
              <p class="text-[10px] text-gray-400 uppercase tracking-wider">Win Rate</p>
              <p class="text-lg font-bold font-mono mt-1 text-blue-400">{winRate}%</p>
            </div>
            <div class="glass p-4 rounded-2xl text-center shadow-lg">
              <p class="text-[10px] text-gray-400 uppercase tracking-wider">Trades</p>
              <p class="text-lg font-bold font-mono mt-1 text-purple-400">{totalTrades}</p>
            </div>
          </div>

          {/* Chart Section */}
          <div class="glass p-5 rounded-2xl shadow-lg">
            <h2 class="text-sm font-bold mb-3 border-b border-gray-700/50 pb-2 text-gray-300">
              <i class="fas fa-chart-area mr-2 text-accent"></i>Intraday Performance
            </h2>
            <div class="relative h-48 w-full">
              <canvas id="mobileChart"></canvas>
            </div>
          </div>

          {/* Recent Trades Table */}
          <div class="glass p-5 rounded-2xl shadow-lg flex flex-col max-h-80">
              <h2 class="text-sm font-bold mb-3 border-b border-gray-700/50 pb-2 text-gray-300">
                <i class="fas fa-history mr-2 text-accent"></i>Recent Executions
              </h2>
              <div class="flex-1 overflow-y-auto scrollbar-hide">
                  <table class="w-full text-xs text-left">
                      <thead class="text-gray-500 uppercase sticky top-0 bg-[#301934]/90 backdrop-blur z-10">
                          <tr>
                              <th class="pb-2 font-medium">Time</th>
                              <th class="pb-2 font-medium">Pos</th>
                              <th class="pb-2 font-medium text-right">PnL</th>
                          </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-800/50">
                          {tableTrades.length === 0 ? (
                              <tr>
                                  <td colspan={3} class="py-6 text-center text-gray-500 italic">No trades executed today</td>
                              </tr>
                          ) : (
                              tableTrades.map((t) => (
                                  <tr class="hover:bg-white/5 transition-colors">
                                      <td class="py-3 text-gray-400">{t.time.substring(0, 5)}</td>
                                      <td class={`py-3 font-bold ${t.position_type === 'CE' ? 'text-green-500' : 'text-red-500'}`}>
                                        {t.position_type}
                                      </td>
                                      <td class={`py-3 font-mono font-bold text-right ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {t.pnl >= 0 ? '+' : ''}₹{t.pnl}
                                      </td>
                                  </tr>
                              ))
                          )}
                      </tbody>
                  </table>
              </div>
          </div>

        </div>

        {/* Chart.js Initialization Script */}
        <script dangerouslySetInnerHTML={{
          __html: `
            const ctx = document.getElementById('mobileChart').getContext('2d');
            Chart.defaults.color = '#64748b';
            Chart.defaults.font.family = 'Inter';
            
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ${JSON.stringify(chartLabels)},
                    datasets: [{
                        data: ${JSON.stringify(chartData)},
                        borderColor: '${dailyPnL >= 0 ? '#10b981' : '#ef4444'}',
                        backgroundColor: '${dailyPnL >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 2,
                        pointBackgroundColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { maxTicksLimit: 5 } },
                        y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                }
            });

            async function killSwitch() {
                if (confirm("🚨 WARNING: This will immediately market-sell open positions and halt the local engine. Proceed?")) {
                    const btn = document.querySelector('button[onclick="killSwitch()"]');
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> SENDING...';
                    
                    try {
                        const response = await fetch('/api/panic', { method: 'POST' });
                        if (response.ok) {
                            btn.innerHTML = '<i class="fas fa-check mr-1"></i> SENT';
                            btn.classList.replace('text-red-400', 'text-white');
                            btn.classList.replace('bg-red-900/50', 'bg-red-600');
                        } else {
                            throw new Error('Network response was not ok');
                        }
                    } catch (error) {
                        alert("Failed to send command to cloud.");
                        btn.innerHTML = originalHtml;
                    }
                }
            }
          `
        }} />
      </body>
    </html>
  )
})

app.post('/api/panic', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  
  const { error } = await supabase
    .from('bot_control')
    .update({ 
      command: 'PANIC', 
      updated_at: new Date().toISOString() 
    })
    .eq('id', 1)

  if (error) return c.json({ status: 'error', message: error.message }, 500)
  return c.json({ status: 'success' })
})

export default app
