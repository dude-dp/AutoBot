import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { getCookie, setCookie } from 'hono/cookie'
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
  NOTION_API_KEY: string
  NOTION_DATABASE_ID: string
  AI: any
}

const app = new Hono<{ Bindings: Bindings }>()

// 1. Edge Security Middleware
app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  // Exclude static assets and the Telegram webhook from basic auth
  if (
    url.pathname === '/sw.js' || 
    url.pathname === '/manifest.json' || 
    url.pathname.startsWith('/static/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/api/telegram-webhook'
  ) {
    return next()
  }

  // Intercept the Telegram Mini App URL Token and set a session cookie
  const urlToken = c.req.query('tg_token')
  if (urlToken === c.env.ADMIN_PASS) {
    setCookie(c, 'auth_session', c.env.ADMIN_PASS, { 
      path: '/', 
      secure: true, 
      httpOnly: true, 
      sameSite: 'None' 
    })
    return next()
  }

  // Allow access if they are navigating tabs inside the Mini App
  if (getCookie(c, 'auth_session') === c.env.ADMIN_PASS) {
    return next()
  }

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

  // --- 1. Global Analytics ---
  const totalTrades = trades.length
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const totalWins = trades.filter(t => t.pnl > 0).length
  const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0

  const ceTrades = trades.filter(t => t.position_type === 'CE')
  const peTrades = trades.filter(t => t.position_type === 'PE')
  const ceWinRate = ceTrades.length > 0 ? Math.round((ceTrades.filter(t => t.pnl > 0).length / ceTrades.length) * 100) : 0
  const peWinRate = peTrades.length > 0 ? Math.round((peTrades.filter(t => t.pnl > 0).length / peTrades.length) * 100) : 0

  // --- 2. Daily Bar Chart Aggregation ---
  const dailyAggregation: Record<string, number> = {}
  trades.forEach(t => {
    if (!dailyAggregation[t.trade_date]) dailyAggregation[t.trade_date] = 0
    dailyAggregation[t.trade_date] += t.pnl
  })
  const chartLabels = Object.keys(dailyAggregation).slice(-14)
  const chartData = Object.values(dailyAggregation).slice(-14)

  // --- 3. TIME-OF-DAY HEATMAP AGGREGATION ---
  const timeBuckets: Record<string, { grossProfit: number, grossLoss: number, netPnl: number, wins: number, total: number }> = {}
  
  // Initialize standard Indian market hours (09:15 to 15:15) in 15-min buckets
  for(let h=9; h<=15; h++) {
      for(let m=0; m<60; m+=15) {
          if (h===9 && m<15) continue;
          if (h===15 && m>15) continue;
          const bin = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          timeBuckets[bin] = { grossProfit: 0, grossLoss: 0, netPnl: 0, wins: 0, total: 0 };
      }
  }

  trades.forEach(t => {
      // Parse HH:MM from "09:17:22"
      const [hh, mm] = t.time.split(':').map(Number);
      const mBin = Math.floor(mm / 15) * 15;
      const binStr = `${hh.toString().padStart(2, '0')}:${mBin.toString().padStart(2, '0')}`;
      
      if(timeBuckets[binStr]) {
          const b = timeBuckets[binStr];
          b.total++;
          b.netPnl += t.pnl;
          if(t.pnl > 0) { b.grossProfit += t.pnl; b.wins++; }
          else { b.grossLoss += Math.abs(t.pnl); }
      }
  });

  const heatmapLabels = Object.keys(timeBuckets);
  const heatmapStats = heatmapLabels.map(bin => {
      const b = timeBuckets[bin];
      // Calculate Profit Factor (PF). If no losses, cap at gross profit.
      const pf = b.grossLoss === 0 ? (b.grossProfit > 0 ? b.grossProfit : 0) : (b.grossProfit / b.grossLoss);
      return { 
          pnl: b.netPnl, 
          pf: Number(pf.toFixed(2)), 
          wr: b.total > 0 ? Math.round((b.wins/b.total)*100) : 0,
          total: b.total
      };
  });

  const content = (
    <Statistics 
      totalTrades={totalTrades} winRate={winRate} totalPnL={totalPnL}
      ceWinRate={ceWinRate} peWinRate={peWinRate}
      chartLabels={chartLabels} chartData={chartData}
      heatmapLabels={heatmapLabels} heatmapStats={heatmapStats}
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
// ==========================================
// 🛡️ RISK MANAGEMENT API
// ==========================================
app.get('/api/risk-config', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const { data } = await supabase.from('bot_control').select('*').eq('id', 1).single()
  
  return c.json({
    maxDrawdown: data?.max_drawdown ?? -1500,
    maxConsecutiveLosses: data?.max_consecutive_losses ?? 3,
    status: data?.status || 'ACTIVE'
  })
})

app.post('/api/risk-config', async (c) => {
  const body = await c.req.json()
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  
  const { error } = await supabase.from('bot_control').update({ 
    max_drawdown: body.maxDrawdown,
    max_consecutive_losses: body.maxConsecutiveLosses,
    status: 'ACTIVE', // Reset status when applying new rules
    updated_at: new Date().toISOString()
  }).eq('id', 1)
  
  if (error) return c.json({ status: 'error', message: error.message }, 500)
  return c.json({ status: 'success' })
})

app.post('/api/halt', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  // Flip the PANIC command for the Python script, and set the UI status to HALTED
  const { error } = await supabase.from('bot_control').update({ 
    command: 'PANIC', 
    status: 'HALTED',
    updated_at: new Date().toISOString() 
  }).eq('id', 1)
  
  if (error) return c.json({ status: 'error', message: error.message }, 500)
  return c.json({ status: 'success' })
})

app.post('/api/panic', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const { error } = await supabase.from('bot_control').update({ command: 'PANIC', updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) return c.json({ status: 'error', message: error.message }, 500)
  return c.json({ status: 'success' })
})

// ==========================================
// 🏷️ AUTOMATED EDGE AI TAGGING
// ==========================================
app.post('/api/tag-trade', async (c) => {
  const { id } = await c.req.json()
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  
  // 1. Fetch the exact trade details
  const { data: trade } = await supabase.from('trade_log').select('*').eq('id', id).single()
  if (!trade) return c.json({ error: 'Trade not found' }, 404)

  // 2. Strict, quantitative prompt for Llama 3
  const prompt = `You are a high-frequency trading algorithm. Categorize this options scalp execution into exactly ONE of these tags based on the PnL and context: [BREAKOUT, REVERSION, CHOP, STOP_HUNT]. 
  Trade Details: Type: ${trade.position_type}, Entry: ₹${trade.buy_price}, Exit: ₹${trade.sell_price}, PnL: ₹${trade.pnl}.
  Respond ONLY with the single exact tag word. No punctuation or explanation.`

  try {
    const aiResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [{ role: 'user', content: prompt }]
    })
    
    // 3. Clean the response and enforce the categories
    let tag = aiResponse.response.trim().toUpperCase().replace(/[^A-Z_]/g, '')
    const validTags = ['BREAKOUT', 'REVERSION', 'CHOP', 'STOP_HUNT']
    if (!validTags.includes(tag)) tag = 'CHOP' // Default fallback

    // 4. Update the database (This will trigger a WebSocket UPDATE payload!)
    await supabase.from('trade_log').update({ ai_tag: tag }).eq('id', id)
    
    return c.json({ status: 'success', tag })
  } catch (err) {
    return c.json({ error: 'AI generation failed' }, 500)
  }
})

app.get('/api/live-data', async (c) => {
  c.header('Cache-Control', 'public, max-age=5')
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const today = new Date().toISOString().split('T')[0]
  const { data: trades } = await supabase.from('trade_log').select('*').eq('trade_date', today).order('id', { ascending: true })
  
  // Fetch latest telemetry for macro_trend and capital
  const { data: telemetry } = await supabase.from('telemetry').select('macro_trend').eq('id', 1).single()
  const macroTrend = telemetry?.macro_trend || 'SCANNING'

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
  return c.json({ dailyPnL: dailyPnL.toFixed(2), winRate, totalTrades, chartLabels, chartData, tableTrades, macroTrend })
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

// ==========================================
// 📱 TELEGRAM HEADLESS COMMAND CENTER
// ==========================================
app.post('/api/telegram-webhook', async (c) => {
  const update = await c.req.json()
  
  // Ignore anything that isn't a direct text message or a callback query
  if (!update.callback_query && (!update.message || !update.message.text)) {
    return c.json({ status: 'ignored' })
  }
  
  let chatId = ""
  let text = ""
  
  if (update.message && update.message.text) {
      chatId = update.message.chat.id.toString()
      text = update.message.text.toLowerCase()
  } else if (update.callback_query) {
      chatId = update.callback_query.message.chat.id.toString()
      text = update.callback_query.data.toLowerCase()
  }

  // 🛡️ Security Check: Only process commands from your personal Chat ID
  if (chatId !== c.env.TELEGRAM_CHAT_ID) {
      console.warn(`Unauthorized access attempt from Chat ID: ${chatId}`)
      return c.json({ status: 'unauthorized' }, 403)
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)

  // Helper function to send replies back to Telegram
  const reply = async (msg: string) => {
    await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
    })
  }

  // Acknowledge Telegram callback query if present to stop loading animation
  if (update.callback_query) {
    try {
      await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: update.callback_query.id })
      })
    } catch (e) {}
  }

  try {
    if (text.startsWith('/panic') || text.startsWith('/halt')) {
      await supabase.from('bot_control').update({ command: 'PANIC', status: 'HALTED', updated_at: new Date().toISOString() }).eq('id', 1)
      await reply("🚨 *SYSTEM HALTED*\n\nAutonomous circuit breakers manually tripped via Telegram. Python engine instructed to market-sell all live positions.")
    
    } else if (text.startsWith('/resume')) {
      await supabase.from('bot_control').update({ status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', 1)
      await reply("✅ *SYSTEM ARMED*\n\nCircuit breakers reset. Engine is scanning the microstructure.")

    } else if (text.startsWith('/status')) {
      const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"})).toISOString().split('T')[0]
      const { data: trades } = await supabase.from('trade_log').select('*').eq('trade_date', today)
      const { data: control } = await supabase.from('bot_control').select('*').eq('id', 1).single()

      const totalPnL = trades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0
      const wins = trades?.filter(t => t.pnl > 0).length || 0
      const total = trades?.length || 0
      const wr = total > 0 ? Math.round((wins / total) * 100) : 0

      const msg = `📊 *Edge Terminal Snapshot*\n\n` +
                  `⚙️ State: *${control?.status}*\n` +
                  `💰 Net PnL: *₹${totalPnL.toFixed(2)}*\n` +
                  `🎯 Win Rate: *${wr}%* (${wins}/${total})\n\n` +
                  `🛡️ Risk Limit: ₹${control?.max_drawdown}\n` +
                  `🛡️ Loss Limit: ${control?.max_consecutive_losses} consecutive`
      await reply(msg)

    } else if (text.startsWith('/start') || text.startsWith('/menu')) {
      const workerUrl = new URL(c.req.url).origin + `/?tg_token=${c.env.ADMIN_PASS}`
      await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: "⚡ *AutoBot Edge Systems Armed*\n\nSelect an option below to manage the terminal.", 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: "📱 Open Live Terminal", web_app: { url: workerUrl } }],
              [{ text: "📊 Quick Status", callback_data: "/status" }, { text: "🛑 KILL SWITCH", callback_data: "/panic" }]
            ]
          }
        })
      })

    } else {
      await reply("🤖 *AutoBot Edge Commands:*\n`/status` - Live PnL & Risk Check\n`/halt` - Emergency Kill Switch\n`/resume` - Re-arm System")
    }
  } catch (err) {
    console.error("Telegram Webhook Error:", err)
  }

  // Always return 200 to Telegram so it doesn't retry the payload
  return c.json({ status: 'success' })
})

// Helper function to push the journal to Notion
async function createNotionJournal(env: Bindings, dateStr: string, stats: any, aiSummary: string) {
  const notionUrl = 'https://api.notion.com/v1/pages';
  
  const isGreenDay = stats.netPnl >= 0;
  const pnlColor = isGreenDay ? "green" : "red";
  const icon = isGreenDay ? "📈" : "🩸";

  const payload = {
    parent: { database_id: env.NOTION_DATABASE_ID },
    icon: { type: "emoji", emoji: icon },
    properties: {
      "Name": { title: [{ text: { content: `Session: ${dateStr}` } }] }
    },
    children: [
      {
        object: "block",
        type: "callout",
        callout: {
          rich_text: [{ type: "text", text: { content: `Net PnL: ₹${stats.netPnl.toFixed(2)} | Profit Factor: ${stats.profitFactor}x | Win Rate: ${stats.winRate}%` } }],
          icon: { emoji: "💰" },
          color: `${pnlColor}_background`
        }
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: "🤖 Llama 3 Microstructure Analysis" } }] }
      },
      {
        object: "block",
        type: "quote",
        quote: { rich_text: [{ type: "text", text: { content: aiSummary } }] }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: "Execution Metrics" } }] }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Total Executions: ${stats.totalTrades}` } }] }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Gross Profit: ₹${stats.grossProfit.toFixed(2)}` } }] }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Gross Loss: ₹${stats.grossLoss.toFixed(2)}` } }] }
      }
    ]
  };

  await fetch(notionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify(payload)
  });
}

// ==========================================
// ⏰ CLOUDFLARE CRON TRIGGER EXPORT
// ==========================================
export default {
  // Pass the standard HTTP requests to Hono
  fetch: app.fetch,
  
  // Handle the automated 3:45 PM Cron Trigger
  async scheduled(event: any, env: Bindings, ctx: any) {
    console.log("⏰ Commencing End-of-Day Journal Generation...");
    
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    const today = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"})).toISOString().split('T')[0];

    // 1. Fetch Today's Log
    const { data: trades } = await supabase.from('trade_log').select('*').eq('trade_date', today);
    if (!trades || trades.length === 0) return;

    // 2. Crunch the Math
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.pnl > 0).length;
    const winRate = Math.round((wins / totalTrades) * 100);
    const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? grossProfit : 0).toFixed(2) : (grossProfit / grossLoss).toFixed(2);

    const stats = { totalTrades, winRate, netPnl, grossProfit, grossLoss, profitFactor };

    // 3. Generate Llama 3 Summary
    const tradeString = trades.map(t => `[${t.time.substring(0,5)}] ${t.ai_tag || 'TRADE'} | PnL: ₹${t.pnl}`).join('\n');
    const prompt = `You are an institutional trading analyst. Review today's executions. Provide a max 3-sentence summary of the market microstructure based on these trades. Mention significant chop, breakouts, or drawdowns.
    
    Trades:
    ${tradeString}`;

    let aiSummary = "AI Analysis unavailable.";
    try {
      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });
      aiSummary = aiResponse.response.trim();
    } catch (e) {
      console.error("Llama 3 inference failed.");
    }

    // 4. Push to Notion and Send Telegram Confirmation
    await createNotionJournal(env, today, stats, aiSummary);
    
    const tgMessage = `📔 *Notion Journal Created*\n\n💰 Net PnL: ₹${netPnl.toFixed(2)}\n📊 Profit Factor: ${profitFactor}x\n\nThe full session breakdown and AI analysis has been archived in your workspace.`;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: tgMessage, parse_mode: 'Markdown' })
    });
  }
}
