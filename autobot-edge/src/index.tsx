import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { createClient } from '@supabase/supabase-js'
import { Layout } from './components/Layout'
import { TopBar } from './components/TopBar'
import { Orders } from './components/Orders'
import { Statistics } from './components/Statistics'
import { Dashboard } from './components/Dashboard'
import { Simulations } from './components/Simulations'

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
  const content = <Dashboard supabaseUrl={c.env.SUPABASE_URL} supabaseKey={c.env.SUPABASE_KEY} />
  return c.html(isHX ? content : <Layout title="AutoBot Edge | Dashboard" currentPath="/">{content}</Layout>)
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
  
  return c.html(isHX ? content : <Layout title="AutoBot Edge | Orders" currentPath="/orders">{content}</Layout>)
})

// Statistics Route
app.get('/statistics', async (c) => {
  const isHX = c.req.header('HX-Request') === 'true'
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  
  // Fetch ALL trades for global analytics
  const { data: trades, error } = await supabase
    .from('trade_log')
    .select('*')
    .order('id', { ascending: true })

  if (error || !trades) {
    const errorContent = (
      <div class="flex flex-col h-full animate-fade-in">
        <TopBar title="System Analytics" />
        <div class="glass-card rounded-3xl p-6">
          <p class="text-red-400">Failed to load analytics from database.</p>
        </div>
      </div>
    )
    return c.html(isHX ? errorContent : <Layout title="Error" currentPath="/statistics">{errorContent}</Layout>)
  }

  // --- Edge-Computed Analytics ---
  const totalTrades = trades.length
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const totalWins = trades.filter(t => t.pnl > 0).length
  const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0

  // Asset Specific Win Rates
  const ceTrades = trades.filter(t => t.position_type === 'CE')
  const peTrades = trades.filter(t => t.position_type === 'PE')
  
  const ceWins = ceTrades.filter(t => t.pnl > 0).length
  const peWins = peTrades.filter(t => t.pnl > 0).length

  const ceWinRate = ceTrades.length > 0 ? Math.round((ceWins / ceTrades.length) * 100) : 0
  const peWinRate = peTrades.length > 0 ? Math.round((peWins / peTrades.length) * 100) : 0

  // Daily PnL Aggregation for the Bar Chart
  const dailyAggregation: Record<string, number> = {}
  trades.forEach(t => {
    if (!dailyAggregation[t.trade_date]) dailyAggregation[t.trade_date] = 0
    dailyAggregation[t.trade_date] += t.pnl
  })

  // Extract the last 14 days for the chart to keep it clean
  const chartLabels = Object.keys(dailyAggregation).slice(-14)
  const chartData = Object.values(dailyAggregation).slice(-14)

  const content = (
    <Statistics 
      totalTrades={totalTrades} 
      winRate={winRate} 
      totalPnL={totalPnL}
      ceWinRate={ceWinRate}
      peWinRate={peWinRate}
      chartLabels={chartLabels}
      chartData={chartData}
    />
  )

  return c.html(isHX ? content : <Layout title="AutoBot Edge | Statistics" currentPath="/statistics">{content}</Layout>)
})

// Simulations Route
app.get('/simulations', async (c) => {
  const isHX = c.req.header('HX-Request') === 'true'
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  
  // Fetch the historical backtest runs
  const { data: runs, error } = await supabase
    .from('backtest_runs')
    .select('*')
    .order('id', { ascending: false })
    .limit(50)

  if (error) console.error("Supabase fetch error for simulations:", error)

  // Provide dummy data for UI visualization if table is empty/uncreated or query errors
  const displayRuns = runs?.length ? runs.map(r => ({
    id: r.id.toString(),
    date: r.created_at ? r.created_at.split('T')[0] : (r.date ? r.date.split('T')[0] : new Date().toISOString().split('T')[0]),
    target: typeof r.target === 'string' ? parseFloat(r.target) : (r.target || 0),
    stop_loss: typeof r.stop_loss === 'string' ? parseFloat(r.stop_loss) : (r.stop_loss || 0),
    trail_trigger: typeof r.trail_trigger === 'string' ? parseFloat(r.trail_trigger) : (r.trail_trigger || 0),
    trail_dist: typeof r.trail_dist === 'string' ? parseFloat(r.trail_dist) : (r.trail_dist || 0),
    total_trades: typeof r.total_trades === 'string' ? parseInt(r.total_trades) : (r.total_trades || 0),
    win_rate: typeof r.win_rate === 'string' ? parseInt(r.win_rate) : (r.win_rate || 0),
    net_pnl: typeof r.net_pnl === 'string' ? parseFloat(r.net_pnl) : (r.net_pnl || 0)
  })) : [
    { id: '1', date: '2026-05-24', target: 1.5, stop_loss: 2.0, trail_trigger: 2.5, trail_dist: 1.0, total_trades: 42, win_rate: 68, net_pnl: 3450.00 },
    { id: '2', date: '2026-05-23', target: 2.0, stop_loss: 1.5, trail_trigger: 3.0, trail_dist: 1.0, total_trades: 38, win_rate: 45, net_pnl: -1200.00 },
    { id: '3', date: '2026-05-22', target: 1.0, stop_loss: 2.5, trail_trigger: 2.0, trail_dist: 0.5, total_trades: 56, win_rate: 72, net_pnl: 5200.00 }
  ];

  const content = <Simulations runs={displayRuns} />

  return c.html(isHX ? content : <Layout title="AutoBot Edge | Simulations" currentPath="/simulations">{content}</Layout>)
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
