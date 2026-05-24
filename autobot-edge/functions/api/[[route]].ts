import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { createClient } from '@supabase/supabase-js'
import { handle } from 'hono/cloudflare-pages'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_KEY: string
  ADMIN_USER: string
  ADMIN_PASS: string
  TELEGRAM_TOKEN: string
  TELEGRAM_CHAT_ID: string
  AI: any
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

// 1. Edge Security Middleware
app.use('*', async (c, next) => {
  const auth = basicAuth({ username: c.env.ADMIN_USER, password: c.env.ADMIN_PASS })
  return auth(c, next)
})

// Cloud Command Bridge
app.post('/panic', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const { error } = await supabase
    .from('bot_control')
    .update({ command: 'PANIC', updated_at: new Date().toISOString() })
    .eq('id', 1)

  if (error) return c.json({ status: 'error', message: error.message }, 500)
  return c.json({ status: 'success' })
})

// Edge-Cached Live Data Endpoint
app.get('/live-data', async (c) => {
  // Edge Cache Strategy: Cache for 5 seconds to protect Supabase from multi-client polling
  c.header('Cache-Control', 'public, max-age=5')
  
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const today = new Date().toISOString().split('T')[0]

  const { data: trades } = await supabase
    .from('trade_log')
    .select('*')
    .eq('trade_date', today)
    .order('id', { ascending: true })

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

// The AI Generation Logic
export async function generateDailySummary(env: Bindings, trades: any[]) {
    if (!trades || trades.length === 0) return "No trades executed today."
    
    const tradeString = trades.map(t => `${t.time} | ${t.position_type} | PnL: ₹${t.pnl}`).join('\n')
    const prompt = `You are a quantitative trading analyst. Review the following options scalping trades for today. Keep analysis under 3 sentences, extremely concise, mentioning overall sentiment (choppy, trending) and notable drawdowns or win streaks.\n\nTrades:\n${tradeString}`
    
    try {
        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: [{ role: 'user', content: prompt }]
        })
        return aiResponse.response
    } catch (e) {
        return "AI analysis failed to generate."
    }
}

app.get('/analyze', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const today = new Date().toISOString().split('T')[0]
  const { data: trades } = await supabase.from('trade_log').select('*').eq('trade_date', today)
  
  const summary = await generateDailySummary(c.env, trades || [])
  return c.json({ summary })
})

// EOD Telegram Trigger (Since Pages doesn't natively support wrangler.jsonc crons)
app.get('/trigger-eod', async (c) => {
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

// Export the fetch handler for Pages
export const onRequest = handle(app)
