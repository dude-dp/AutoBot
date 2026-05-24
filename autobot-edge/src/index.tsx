import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { createClient } from '@supabase/supabase-js'
import { Layout } from './components/Layout'
import { TopBar } from './components/TopBar'
import { Orders } from './components/Orders'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_KEY: string
  ADMIN_USER: string
  ADMIN_PASS: string
  TELEGRAM_TOKEN: string
  TELEGRAM_CHAT_ID: string
  AI: any
}

const app = new Hono<{ Bindings: Bindings }>()

// 1. Edge Security Middleware
app.use('*', async (c, next) => {
  const auth = basicAuth({ username: c.env.ADMIN_USER, password: c.env.ADMIN_PASS })
  return auth(c, next)
})

// Dashboard Route
app.get('/', async (c) => {
  const isHX = c.req.header('HX-Request') === 'true'
  
  const content = (
    <div class="animate-fade-in flex flex-col h-full">
      <TopBar title="Dashboard" />
      
      {/* Metrics Row */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div class="glass-card rounded-3xl p-6 relative overflow-hidden group hover:border-white/20 transition-colors">
              <div class="flex justify-between items-start mb-4">
                  <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/20">
                      <i class="fas fa-wallet text-emerald-400"></i>
                  </div>
                  <span class="text-xs font-semibold px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg">LIVE</span>
              </div>
              <p class="text-sm text-gray-400 font-medium mb-1">Available Capital</p>
              <h3 class="text-2xl font-bold font-mono tracking-tight">₹40,000</h3>
          </div>

          <div class="glass-card rounded-3xl p-6 relative overflow-hidden hover:border-white/20 transition-colors">
              <div class="flex justify-between items-start mb-4">
                  <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20">
                      <i class="fas fa-crosshairs text-blue-400"></i>
                  </div>
              </div>
              <p class="text-sm text-gray-400 font-medium mb-1">Win Rate</p>
              <h3 id="ui-winrate" class="text-2xl font-bold font-mono tracking-tight">...</h3>
          </div>

          <div class="glass-card rounded-3xl p-6 relative overflow-hidden hover:border-white/20 transition-colors">
              <div class="flex justify-between items-start mb-4">
                  <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
                      <i class="fas fa-bolt text-purple-400"></i>
                  </div>
              </div>
              <p class="text-sm text-gray-400 font-medium mb-1">Executions</p>
              <h3 id="ui-trades" class="text-2xl font-bold font-mono tracking-tight">...</h3>
          </div>

          <div id="pnl-card" class="rounded-3xl p-6 relative overflow-hidden bg-gradient-to-br border shadow-lg transition-colors duration-500">
              <div class="flex justify-between items-start mb-4">
                  <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                      <i class="fas fa-chart-line text-white"></i>
                  </div>
                  <button onclick="analyzeDay()" class="text-[10px] uppercase tracking-wider bg-black/20 hover:bg-black/40 text-white/90 border border-white/20 px-3 py-1.5 rounded-lg font-bold transition-all active:scale-95">
                      <i class="fas fa-sparkles mr-1"></i> Edge AI
                  </button>
              </div>
              <p class="text-sm text-white/80 font-medium mb-1">Net PnL</p>
              <h3 id="ui-pnl" class="text-3xl font-bold font-mono tracking-tight text-white">...</h3>
          </div>
      </div>

      {/* AI Summary Box */}
      <div id="ai-summary-box" class="hidden mb-6 p-4 glass-card border-l-2 border-blue-500 rounded-r-3xl text-sm text-blue-100 leading-relaxed"></div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="glass-card rounded-3xl p-6 lg:col-span-2 min-h-[400px] flex flex-col">
              <div class="flex justify-between items-center mb-6">
                  <h3 class="font-semibold text-gray-200">Equity Curve</h3>
              </div>
              <div class="flex-1 rounded-xl flex items-center justify-center w-full min-h-[300px] relative">
                  <canvas id="mobileChart"></canvas>
              </div>
          </div>

          <div class="glass-card rounded-3xl p-6 flex flex-col">
              <h3 class="font-semibold text-gray-200 mb-6">Order Book</h3>
              <div id="trades-container" class="space-y-4 flex-1 overflow-y-auto custom-scroll pr-2">
                  <div class="text-center text-gray-500 italic py-10">Awaiting data...</div>
              </div>
          </div>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
        let myChart = null;

        function createGradient(ctx, isProfit) {
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            if (isProfit) {
                gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
                gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
            } else {
                gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
                gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
            }
            return gradient;
        }

        async function fetchLiveData() {
            try {
                const res = await fetch('/api/live-data');
                const data = await res.json();
                
                const pnlEl = document.getElementById('ui-pnl');
                const pnlCard = document.getElementById('pnl-card');
                
                const isProfit = data.dailyPnL >= 0;
                pnlEl.innerText = (isProfit ? '+' : '') + '₹' + Math.abs(data.dailyPnL).toFixed(2);
                
                if (isProfit) {
                    pnlCard.className = 'rounded-3xl p-6 relative overflow-hidden bg-gradient-to-br from-emerald-500/80 to-teal-600/80 border border-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-colors duration-500';
                } else {
                    pnlCard.className = 'rounded-3xl p-6 relative overflow-hidden bg-gradient-to-br from-red-500/80 to-rose-600/80 border border-red-400/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] transition-colors duration-500';
                }

                document.getElementById('ui-winrate').innerText = data.winRate + '%';
                document.getElementById('ui-trades').innerText = data.totalTrades;

                const tradesContainer = document.getElementById('trades-container');
                if (data.tableTrades.length === 0) {
                    tradesContainer.innerHTML = '<div class="text-center text-gray-500 italic py-10">No trades executed today</div>';
                } else {
                    tradesContainer.innerHTML = data.tableTrades.map(t => {
                        const tIsProfit = t.pnl >= 0;
                        const bgDot = t.position_type === 'CE' ? 'bg-green-500' : 'bg-red-500';
                        const pnlClass = tIsProfit ? 'text-green-400' : 'text-red-400';
                        const sign = tIsProfit ? '+' : '';
                        return \`
                        <div class="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/10 group">
                            <div class="flex items-center gap-3">
                                <div class="w-2 h-2 rounded-full \${bgDot}"></div>
                                <div>
                                    <p class="text-sm font-semibold">\${t.position_type}</p>
                                    <p class="text-xs text-gray-500 font-mono">\${t.time.substring(0,8)}</p>
                                </div>
                            </div>
                            <p class="font-mono text-sm group-hover:scale-105 transition-transform \${pnlClass}">\${sign}₹\${Math.abs(t.pnl).toFixed(2)}</p>
                        </div>
                        \`;
                    }).join('');
                }

                const ctx = document.getElementById('mobileChart').getContext('2d');
                const lineColor = isProfit ? '#10b981' : '#ef4444';

                if (!myChart) {
                    Chart.defaults.color = '#94a3b8';
                    Chart.defaults.font.family = 'Inter';
                    myChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: data.chartLabels,
                            datasets: [{
                                data: data.chartData,
                                borderColor: lineColor,
                                backgroundColor: createGradient(ctx, isProfit),
                                borderWidth: 3, fill: true, tension: 0.4, pointRadius: 0,
                                pointHitRadius: 10, pointHoverRadius: 6, pointHoverBackgroundColor: '#fff',
                                pointHoverBorderColor: lineColor, pointHoverBorderWidth: 2
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            interaction: { mode: 'index', intersect: false },
                            plugins: { legend: { display: false } },
                            scales: { 
                                x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } }, 
                                y: { grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false } } 
                            }
                        }
                    });
                } else {
                    myChart.data.labels = data.chartLabels;
                    myChart.data.datasets[0].data = data.chartData;
                    myChart.data.datasets[0].borderColor = lineColor;
                    myChart.data.datasets[0].backgroundColor = createGradient(ctx, isProfit);
                    myChart.update('none');
                }

                document.getElementById('sync-text').innerText = 'Edge Synced';
                document.getElementById('sync-text').className = 'text-gray-300 font-medium';
                document.getElementById('sync-indicator').className = 'glass-card px-4 py-2 rounded-full flex items-center gap-2 text-sm transition-colors duration-300';
                document.getElementById('sync-indicator').querySelector('div').className = 'w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_#4ade80]';

            } catch (err) {
                document.getElementById('sync-text').innerText = 'Reconnecting...';
                document.getElementById('sync-text').className = 'text-yellow-400 font-medium';
                document.getElementById('sync-indicator').className = 'glass-card px-4 py-2 rounded-full flex items-center gap-2 text-sm transition-colors duration-300 border-yellow-500/50';
                document.getElementById('sync-indicator').querySelector('div').className = 'w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_#facc15]';
            }
        }

        async function analyzeDay() {
            const box = document.getElementById('ai-summary-box');
            box.classList.remove('hidden');
            box.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Analyzing microstructure...';
            try {
                const res = await fetch('/api/analyze');
                const data = await res.json();
                box.innerHTML = '<span class="font-semibold block mb-1"><i class="fas fa-sparkles mr-2"></i>Edge AI Analyst:</span>' + data.summary;
            } catch (e) {
                box.innerHTML = 'Analysis unavailable.';
            }
        }

        fetchLiveData();
        setInterval(fetchLiveData, 5000);
        `
      }} />
    </div>
  )

  return c.html(isHX ? content : <Layout title="AutoBot Edge | Dashboard">{content}</Layout>)
})

// Orders Route
app.get('/orders', async (c) => {
  const isHX = c.req.header('HX-Request') === 'true'
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  
  const { data: trades, error } = await supabase
    .from('trade_log')
    .select('*')
    .order('id', { ascending: false })
    .limit(100)

  if (error) console.error("Supabase fetch error:", error)

  const content = <Orders trades={trades || []} />
  
  return c.html(isHX ? content : <Layout title="AutoBot Edge | Orders">{content}</Layout>)
})

// API Endpoints
app.post('/api/panic', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const { error } = await supabase.from('bot_control').update({ command: 'PANIC', updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) return c.json({ status: 'error', message: error.message }, 500)
  return c.json({ status: 'success' })
})

app.get('/api/live-data', async (c) => {
  c.header('Cache-Control', 'public, max-age=5')
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const today = new Date().toISOString().split('T')[0]
  const { data: trades } = await supabase.from('trade_log').select('*').eq('trade_date', today).order('id', { ascending: true })

  const totalTrades = trades?.length || 0
  const wins = trades?.filter(t => t.pnl > 0).length || 0
  const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0
  const dailyPnL = trades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0

  let cumulative = 0;
  const chartLabels = trades?.map(t => t.time.substring(0, 5)) || [];
  const chartData = trades?.map(t => {
      cumulative += (t.pnl || 0);
      return cumulative.toFixed(2);
  }) || [];

  const tableTrades = trades ? [...trades].reverse() : [];
  return c.json({ dailyPnL: dailyPnL.toFixed(2), winRate, totalTrades, chartLabels, chartData, tableTrades })
})

export async function generateDailySummary(env: Bindings, trades: any[]) {
    if (!trades || trades.length === 0) return "No trades executed today."
    const tradeString = trades.map(t => `${t.time} | ${t.position_type} | PnL: ₹${t.pnl}`).join('\n')
    const prompt = `You are a quantitative trading analyst. Review the following options scalping trades for today. Keep analysis under 3 sentences, extremely concise, mentioning overall sentiment (choppy, trending) and notable drawdowns or win streaks.\n\nTrades:\n${tradeString}`
    try {
        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', { messages: [{ role: 'user', content: prompt }] })
        return aiResponse.response
    } catch (e) {
        return "AI analysis failed to generate."
    }
}

app.get('/api/analyze', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const today = new Date().toISOString().split('T')[0]
  const { data: trades } = await supabase.from('trade_log').select('*').eq('trade_date', today)
  const summary = await generateDailySummary(c.env, trades || [])
  return c.json({ summary })
})

app.get('/api/trigger-eod', async (c) => {
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
    const today = new Date().toISOString().split('T')[0]
    const { data: trades } = await supabase.from('trade_log').select('*').eq('trade_date', today)
    
    const dailyPnL = trades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0
    const summary = await generateDailySummary(c.env, trades || [])
    
    const message = `🤖 *AutoBot Edge EOD Report*\n\n*Date:* ${today}\n*Net PnL:* ₹${dailyPnL.toFixed(2)}\n*Trades:* ${trades?.length || 0}\n\n*AI Analysis:*\n${summary}`

    await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: c.env.TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
    })

    return c.json({ status: 'EOD report sent to Telegram.' })
})

export default app
