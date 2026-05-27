import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_KEY: string
  TELEGRAM_TOKEN: string
  TELEGRAM_CHAT_ID: string
  UPSTOX_API_KEY: string
  UPSTOX_API_SECRET: string
  REDIRECT_URI: string
}

const app = new Hono<{ Bindings: Bindings }>()

// ==========================================
// 🔐 CLOUDFLARE EDGE: UPSTOX OAUTH 2.0
// ==========================================

// 1. Initiate Login
app.get('/auth/login', (c) => {
  const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${c.env.UPSTOX_API_KEY}&redirect_uri=${encodeURIComponent(c.env.REDIRECT_URI)}`
  return c.redirect(authUrl)
})

// 2. Handle Callback & Save to Supabase
app.get('/auth/callback', async (c) => {
  const code = c.req.query('code')
  
  if (!code) {
    return c.text('Authorization code missing!', 400)
  }

  const url = 'https://api.upstox.com/v2/login/authorization/token'
  
  const formData = new URLSearchParams()
  formData.append('code', code)
  formData.append('client_id', c.env.UPSTOX_API_KEY)
  formData.append('client_secret', c.env.UPSTOX_API_SECRET)
  formData.append('redirect_uri', c.env.REDIRECT_URI)
  formData.append('grant_type', 'authorization_code')

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    })

    const json: any = await response.json()

    if (!response.ok) {
      return c.json({ error: 'Failed to fetch token', details: json }, response.status as any)
    }

    const token = json.access_token

    // Save Token directly to Supabase
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
    const { error } = await supabase.from("app_config").upsert({ key: "UPSTOX_ACCESS_TOKEN", value: token })
    
    if (error) {
      return c.text(`Error saving token to Supabase: ${error.message}`, 500)
    }

    // Notify via Telegram
    await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: c.env.TELEGRAM_CHAT_ID, 
        text: `✅ *Upstox Authentication Successful*\nNew API Token generated and securely stored in Supabase.`, 
        parse_mode: 'Markdown' 
      })
    })

    return c.html(`
      <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #070a13; color: white;">
          <h2>✅ Authentication Successful!</h2>
          <p>The Upstox Access Token has been securely stored in your Supabase database.</p>
          <p>You can now close this window and refresh your dashboard.</p>
        </body>
      </html>
    `)

  } catch (err: any) {
    return c.text(`Server Error: ${err.message}`, 500)
  }
})

// ==========================================
// 🖥️ API ENDPOINTS FOR THE DASHBOARD
// ==========================================

// Get last 40 logs from Supabase
app.get('/api/logs', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  const { data, error } = await supabase
    .from('sync_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) {
    return c.json({ error: error.message }, 500)
  }
  return c.json(data || [])
})

// Get overall stats
app.get('/api/stats', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_KEY)
  
  // Get count of total MTF enabled stocks
  const { count: total, error: err1 } = await supabase
    .from('upstox_mtf')
    .select('*', { count: 'exact', head: true })
    .eq('mtf_enabled', true)

  // Get count of synced stocks
  const { count: synced, error: err2 } = await supabase
    .from('upstox_mtf')
    .select('*', { count: 'exact', head: true })
    .eq('mtf_enabled', true)
    .not('ltp', 'is', null)

  if (err1 || err2) {
    return c.json({ error: err1?.message || err2?.message }, 500)
  }

  return c.json({
    total: total || 0,
    synced: synced || 0
  })
})

// Trigger a manual sync from the Dashboard
app.post('/api/sync', async (c) => {
  c.executionCtx.waitUntil(syncMtfStocks(c.env))
  return c.json({ success: true, message: 'Sync started in the background.' })
})

// ==========================================
// 📱 TELEGRAM WEBHOOK HANDLER
// ==========================================
app.post('/api/telegram-webhook', async (c) => {
  const update = await c.req.json()
  
  if (!update.message || !update.message.text) {
    return c.json({ status: 'ignored' })
  }
  
  const chatId = update.message.chat.id.toString()
  const text = update.message.text.toLowerCase()

  if (chatId !== c.env.TELEGRAM_CHAT_ID) {
      console.warn(`Unauthorized access attempt from Chat ID: ${chatId}`)
      return c.json({ status: 'unauthorized' }, 403)
  }

  const reply = async (msg: string) => {
    await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
    })
  }

  try {
    if (text.startsWith('/sync')) {
      await reply("🔄 Triggering manual MTF stocks sync in the background...")
      c.executionCtx.waitUntil(syncMtfStocks(c.env))
    } else if (text.startsWith('/login')) {
      const loginUrl = `${new URL(c.req.url).origin}/auth/login`
      await reply(`🔐 *Upstox Login*\n\nClick below to authenticate your Upstox account:\n${loginUrl}`)
    } else {
      await reply("🤖 *MTF AutoBot Commands:*\n`/login` - Generate new Upstox API Token\n`/sync` - Trigger Manual Sync")
    }
  } catch (err) {
    console.error("Telegram Webhook Error:", err)
  }

  return c.json({ status: 'success' })
})

// ==========================================
// 🎨 BEAUTIFUL GLASSMORPHIC HTML DASHBOARD
// ==========================================
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AutoBot MTF Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #070a13;
            --card-bg: rgba(17, 24, 39, 0.6);
            --border-color: rgba(255, 255, 255, 0.08);
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --accent-primary: #6366f1;
            --accent-primary-hover: #4f46e5;
            --success: #10b981;
            --error: #ef4444;
            --info: #3b82f6;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow-x: hidden;
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 40%);
        }

        /* Glassmorphic Navbar */
        .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 2rem;
            background: rgba(10, 15, 30, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .logo {
            font-size: 1.25rem;
            font-weight: 700;
            background: linear-gradient(135deg, #a5b4fc 0%, #6366f1 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .status-pill {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.2);
            color: var(--success);
            padding: 0.35rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.85rem;
            font-weight: 500;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background-color: var(--success);
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 8px var(--success);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        /* Container */
        .container {
            max-width: 1200px;
            width: 100%;
            margin: 2rem auto;
            padding: 0 1.5rem;
            display: grid;
            grid-template-columns: 1fr;
            gap: 2rem;
            flex-grow: 1;
        }

        @media (min-width: 768px) {
            .container {
                grid-template-columns: 350px 1fr;
            }
        }

        /* Cards */
        .card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        }

        .card-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-primary);
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.75rem;
        }

        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.75rem 1.25rem;
            border-radius: 10px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease-in-out;
            text-decoration: none;
            border: none;
            width: 100%;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--accent-primary) 0%, #4f46e5 100%);
            color: white;
            box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
        }

        .btn-primary:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6);
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
        }

        .btn-secondary:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-2px);
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
        }

        .stat-item {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-color);
            padding: 1rem;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }

        .stat-label {
            font-size: 0.8rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .stat-val {
            font-size: 1.75rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        /* Progress Bar */
        .progress-container {
            margin-top: 0.5rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 9999px;
            height: 8px;
            width: 100%;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, var(--accent-primary) 0%, var(--success) 100%);
            width: 0%;
            transition: width 0.5s ease-out;
        }

        /* Terminal View */
        .terminal {
            display: flex;
            flex-direction: column;
            background: #05070f;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            overflow: hidden;
            height: 480px;
            box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
        }

        .terminal-header {
            background: #0f1220;
            padding: 0.75rem 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .terminal-actions {
            display: flex;
            gap: 0.4rem;
        }

        .terminal-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }

        .dot-red { background: #ef4444; }
        .dot-yellow { background: #f59e0b; }
        .dot-green { background: #10b981; }

        .terminal-title {
            font-family: 'Fira Code', monospace;
            font-size: 0.8rem;
            color: var(--text-secondary);
        }

        .terminal-body {
            flex-grow: 1;
            padding: 1.25rem;
            overflow-y: auto;
            font-family: 'Fira Code', 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            line-height: 1.5;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            scroll-behavior: smooth;
        }

        .log-entry {
            display: flex;
            gap: 0.75rem;
            animation: fadeIn 0.15s ease-out forwards;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .log-time {
            color: #4b5563;
            flex-shrink: 0;
            user-select: none;
        }

        .log-text-info { color: #9ca3af; }
        .log-text-success { color: var(--success); font-weight: 500; }
        .log-text-error { color: var(--error); font-weight: 500; }

        /* Footer */
        .footer {
            text-align: center;
            padding: 1.5rem;
            color: var(--text-secondary);
            font-size: 0.8rem;
            border-top: 1px solid var(--border-color);
            margin-top: auto;
        }
    </style>
</head>
<body>
    <nav class="navbar">
        <div class="logo">
            🤖 AutoBot MTF
        </div>
        <div class="status-pill">
            <span class="status-dot"></span>
            Live Edge Node
        </div>
    </nav>

    <div class="container">
        <!-- Sidebar Controls -->
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            <div class="card">
                <div class="card-title">System Status</div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Total MTF Enabled</span>
                        <span class="stat-val" id="stat-total">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Synced Quote Data</span>
                        <span class="stat-val" id="stat-synced">-</span>
                        <div class="progress-container">
                            <div class="progress-bar" id="stat-progress"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-title">Quick Actions</div>
                <a href="/auth/login" target="_blank" class="btn btn-secondary">
                    🔗 Authorize Upstox
                </a>
                <button class="btn btn-primary" id="btn-sync" onclick="triggerSync()">
                    ⚡ Force Manual Sync
                </button>
            </div>
        </div>

        <!-- Terminal Output -->
        <div class="card" style="gap: 1rem;">
            <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Live Event Console</span>
                <span id="sync-status" style="font-size: 0.8rem; color: var(--text-secondary)">IDLE</span>
            </div>
            <div class="terminal">
                <div class="terminal-header">
                    <div class="terminal-actions">
                        <div class="terminal-dot dot-red"></div>
                        <div class="terminal-dot dot-yellow"></div>
                        <div class="terminal-dot dot-green"></div>
                    </div>
                    <div class="terminal-title">bash - mtf_sync.log</div>
                </div>
                <div class="terminal-body" id="terminal-body">
                    <!-- Logs will load here -->
                </div>
            </div>
        </div>
    </div>

    <footer class="footer">
        AutoBot Edge • Running serverless on Cloudflare Workers
    </footer>

    <script>
        let isSyncing = false;

        async function fetchStats() {
            try {
                const res = await fetch('/api/stats');
                const data = await res.json();
                document.getElementById('stat-total').textContent = data.total;
                document.getElementById('stat-synced').textContent = data.synced;
                
                const percent = data.total > 0 ? (data.synced / data.total) * 100 : 0;
                document.getElementById('stat-progress').style.width = percent + '%';
            } catch (err) {
                console.error("Failed to fetch stats", err);
            }
        }

        async function fetchLogs() {
            try {
                const res = await fetch('/api/logs');
                const logs = await res.json();
                const terminal = document.getElementById('terminal-body');
                
                const shouldScroll = terminal.scrollHeight - terminal.scrollTop <= terminal.clientHeight + 40;
                
                terminal.innerHTML = '';
                if (logs.length === 0) {
                    terminal.innerHTML = '<div style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">No events logged in the last 24h</div>';
                    return;
                }

                // Reverse logs to display oldest at top, newest at bottom (standard terminal style)
                [...logs].reverse().forEach(log => {
                    const time = new Date(log.created_at).toLocaleTimeString();
                    const entry = document.createElement('div');
                    entry.className = 'log-entry';
                    
                    let statusClass = 'log-text-info';
                    if (log.status === 'success') statusClass = 'log-text-success';
                    if (log.status === 'error') statusClass = 'log-text-error';

                    entry.innerHTML = \`
                        <span class="log-time">[\${time}]</span>
                        <span class="\${statusClass}">\${escapeHtml(log.message)}</span>
                    \`;
                    terminal.appendChild(entry);
                });

                if (shouldScroll) {
                    terminal.scrollTop = terminal.scrollHeight;
                }
            } catch (err) {
                console.error("Failed to fetch logs", err);
            }
        }

        function escapeHtml(str) {
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        async function triggerSync() {
            const btn = document.getElementById('btn-sync');
            const status = document.getElementById('sync-status');
            
            btn.disabled = true;
            btn.textContent = '🔄 Syncing...';
            status.textContent = 'SYNCING';
            status.style.color = 'var(--accent-primary)';
            
            try {
                const res = await fetch('/api/sync', { method: 'POST' });
                const data = await res.json();
                
                // Instantly poll logs and stats
                await fetchLogs();
                await fetchStats();
            } catch (err) {
                console.error("Sync trigger failed", err);
            } finally {
                // Keep disabled briefly to avoid spamming
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = '⚡ Force Manual Sync';
                    status.textContent = 'IDLE';
                    status.style.color = 'var(--text-secondary)';
                }, 3000);
            }
        }

        // Initialize and setup polling
        fetchStats();
        fetchLogs();
        setInterval(fetchStats, 5000);
        setInterval(fetchLogs, 2000);
    </script>
</body>
</html>
  `)
})

// ==========================================
// 🔄 CORE SYNC LOGIC
// ==========================================
async function syncMtfStocks(env: Bindings) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  const log = async (msg: string, status: 'info' | 'success' | 'error') => {
    console.log(`[${status.toUpperCase()}] ${msg}`);
    await supabase.from('sync_logs').insert({ message: msg, status });
  };

  await log("🔄 Commencing Live MTF Stocks Update...", "info");

  try {
    // Keep logs table tidy - clean logs older than 1 day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('sync_logs').delete().lt('created_at', oneDayAgo);

    // 1. Get the Upstox Access Token
    const { data: configData, error: configError } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'UPSTOX_ACCESS_TOKEN')
      .single();
    
    if (configError || !configData) {
      await log("❌ Failed to fetch UPSTOX_ACCESS_TOKEN from Supabase", "error");
      return;
    }
    const accessToken = configData.value;
    await log("🔑 Upstox Access Token retrieved successfully", "info");

    // 2. Fetch all instrument keys from upstox_mtf
    const { data: stocks, error: mtfError } = await supabase
      .from('upstox_mtf')
      .select('instrument_key')
      .eq('mtf_enabled', true);

    if (mtfError || !stocks) {
      await log(`❌ Failed to fetch MTF stocks: ${mtfError?.message}`, "error");
      return;
    }
    await log(`📈 Found ${stocks.length} MTF enabled stocks to sync`, "info");

    // 3. Batch into chunks of 500 (Upstox Limit)
    const chunkSize = 500;
    let totalUpdated = 0;

    for (let i = 0; i < stocks.length; i += chunkSize) {
      const chunk = stocks.slice(i, i + chunkSize);
      const keys = chunk.map(s => s.instrument_key).join(',');
      
      await log(`📡 Fetching LTP batch ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(stocks.length / chunkSize)}...`, "info");

      // 4. Call Upstox API (LTP V3)
      const response = await fetch(`https://api.upstox.com/v3/market-quote/ltp?instrument_key=${encodeURIComponent(keys)}`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        await log(`❌ Upstox API error for batch: ${response.status} ${response.statusText}`, "error");
        continue;
      }

      const json: any = await response.json();
      if (json.status !== 'success') {
        await log("❌ Upstox API returned error status for batch", "error");
        continue;
      }

      // 5. Prepare Payload for Bulk Update RPC
      const updatePayload = [];
      for (const key of Object.keys(json.data)) {
        const item = json.data[key];
        updatePayload.push({
          instrument_key: item.instrument_token,
          ltp: item.last_price,
          volume: item.volume,
          previous_close_price: item.cp
        });
      }

      // 6. Push to Supabase using RPC function
      if (updatePayload.length > 0) {
        const { error: rpcError } = await supabase.rpc('bulk_update_mtf', { payload: updatePayload });
        if (rpcError) {
          await log(`❌ Supabase RPC error: ${rpcError.message}`, "error");
        } else {
          await log(`✅ Successfully updated ${updatePayload.length} stocks in this batch`, "info");
          totalUpdated += updatePayload.length;
        }
      }
    }
    
    await log(`🎉 Sync Complete! Total updated stocks: ${totalUpdated}`, "success");

    // 7. Send a summary to Telegram
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: env.TELEGRAM_CHAT_ID, 
        text: `✅ *Live Data Sync Complete*\nUpdated ${totalUpdated} MTF enabled stocks successfully.`, 
        parse_mode: 'Markdown' 
      })
    });

  } catch (e: any) {
    await log(`❌ Scheduled task failed: ${e.message}`, "error");
  }
}

// ==========================================
// ⏰ CLOUDFLARE CRON TRIGGER EXPORT
// ==========================================
export default {
  fetch: app.fetch,
  
  async scheduled(event: any, env: Bindings, ctx: any) {
    ctx.waitUntil(syncMtfStocks(env));
  }
}
