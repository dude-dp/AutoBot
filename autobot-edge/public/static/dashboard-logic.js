import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// 1. Initialize Supabase Client using injected Edge ENV
const supabase = createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_KEY);

let myChart = null;

// State management for live calculations
let state = {
    dailyPnL: 0,
    totalTrades: 0,
    wins: 0,
    cumulativePnL: 0,
    maxDrawdown: -1500,
    maxConsecutiveLosses: 3,
    consecutiveLosses: 0,
    systemStatus: 'ACTIVE'
};

// Gradient Helper for Chart.js
function createGradient(ctx, isProfit) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    if (isProfit) {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    } else {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
    }
    return gradient;
}

// 2. Initial Data Hydration
async function fetchInitialData() {
    try {
        const res = await fetch('/api/live-data');
        const data = await res.json();
        
        // Setup internal state
        state.dailyPnL = parseFloat(data.dailyPnL);
        state.totalTrades = data.totalTrades;
        state.wins = Math.round((data.winRate / 100) * data.totalTrades);
        
        if (data.chartData.length > 0) {
            state.cumulativePnL = parseFloat(data.chartData[data.chartData.length - 1]);
        }

        // Calculate initial consecutive losses from today's trades
        state.consecutiveLosses = 0;
        if (data.tableTrades && data.tableTrades.length > 0) {
            for (let t of data.tableTrades) {
                if (t.pnl < 0) {
                    state.consecutiveLosses++;
                } else {
                    break;
                }
            }
        }

        // Fetch Risk Config from Edge API
        try {
            const riskRes = await fetch('/api/risk-config');
            const riskData = await riskRes.json();
            state.maxDrawdown = riskData.maxDrawdown;
            state.maxConsecutiveLosses = riskData.maxConsecutiveLosses;
            updateSystemStatusUI(riskData.status);

            const inputMaxDd = document.getElementById('input-max-dd');
            const inputMaxLoss = document.getElementById('input-max-loss');
            if (inputMaxDd) inputMaxDd.value = state.maxDrawdown;
            if (inputMaxLoss) inputMaxLoss.value = state.maxConsecutiveLosses;
        } catch (riskErr) {
            console.error("Failed to load risk config:", riskErr);
        }

        updateTopMetrics();
        renderChart(data.chartLabels, data.chartData);
        renderTable(data.tableTrades);
        
        // Start WebSocket Listener
        setupRealtime();

    } catch (err) {
        setSyncStatus('OFFLINE', 'yellow');
    }
}

// Tag rendering helper
function getTagHTML(tag) {
    if (!tag) return `<span class="ai-tag px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-white/5 text-gray-500 border border-white/10 animate-pulse">⚙️ ANALYZING</span>`;
    
    let styleClass = 'bg-white/5 text-gray-400';
    let icon = '⚙️';
    
    if (tag === 'BREAKOUT') { styleClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/30'; icon = '🔥'; }
    else if (tag === 'REVERSION') { styleClass = 'bg-purple-500/20 text-purple-400 border border-purple-500/30'; icon = '⚖️'; }
    else if (tag === 'CHOP') { styleClass = 'bg-gray-500/20 text-gray-400 border border-gray-500/30'; icon = '✂️'; }
    else if (tag === 'STOP_HUNT') { styleClass = 'bg-red-500/20 text-red-400 border border-red-500/30'; icon = '🩸'; }
    else if (tag === 'ANALYZING' || tag.startsWith('ANALYZ')) {
        return `<span class="ai-tag px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-white/5 text-gray-500 border border-white/10 animate-pulse">⚙️ ANALYZING</span>`;
    }
    
    return `<span class="ai-tag px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-all duration-500 ${styleClass}">${icon} ${tag}</span>`;
}

// Live Tag Update handler
function handleLiveTagUpdate(trade) {
    const elements = document.querySelectorAll(`[id="trade-row-${trade.id}"]`);
    elements.forEach(element => {
        const tagSpan = element.querySelector('.ai-tag');
        if (tagSpan) {
            let styleClass = 'bg-white/5 text-gray-400';
            let icon = '⚙️';
            
            if (trade.ai_tag === 'BREAKOUT') { styleClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/30'; icon = '🔥'; }
            else if (trade.ai_tag === 'REVERSION') { styleClass = 'bg-purple-500/20 text-purple-400 border border-purple-500/30'; icon = '⚖️'; }
            else if (trade.ai_tag === 'CHOP') { styleClass = 'bg-gray-500/20 text-gray-400 border border-gray-500/30'; icon = '✂️'; }
            else if (trade.ai_tag === 'STOP_HUNT') { styleClass = 'bg-red-500/20 text-red-400 border border-red-500/30'; icon = '🩸'; }
            
            tagSpan.className = `ai-tag px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-all duration-500 ${styleClass}`;
            tagSpan.innerText = `${icon} ${trade.ai_tag}`;
            
            tagSpan.classList.add('scale-110');
            setTimeout(() => tagSpan.classList.remove('scale-110'), 200);
        }
    });
}

// 3. WebSocket Real-Time Subscription
function setupRealtime() {
    supabase
        .channel('trade_updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trade_log' }, (payload) => {
            const trade = payload.new;
            handleLiveExecution(trade);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trade_log' }, (payload) => {
            const trade = payload.new;
            handleLiveTagUpdate(trade);
        })
        .subscribe((status) => {
            if(status === 'SUBSCRIBED') {
                setSyncStatus('REALTIME', 'green');
            }
        });
}

// 4. Live Execution Handler
function handleLiveExecution(trade) {
    const isProfit = trade.pnl >= 0;
    
    state.dailyPnL += trade.pnl;
    state.totalTrades += 1;
    if (isProfit) {
        state.wins += 1;
        state.consecutiveLosses = 0;
    } else {
        state.consecutiveLosses += 1;
    }
    state.cumulativePnL += trade.pnl;

    updateTopMetrics();

    // Update Chart Live
    if (myChart) {
        const timeLabel = trade.time.substring(0, 5);
        myChart.data.labels.push(timeLabel);
        myChart.data.datasets[0].data.push(state.cumulativePnL.toFixed(2));
        
        const globalIsProfit = state.dailyPnL >= 0;
        const ctx = document.getElementById('mobileChart').getContext('2d');
        myChart.data.datasets[0].borderColor = globalIsProfit ? '#10b981' : '#ef4444';
        myChart.data.datasets[0].backgroundColor = createGradient(ctx, globalIsProfit);
        
        myChart.update('none');
    }

    // Inject into trade feed
    const tradesContainer = document.getElementById('trades-container');
    if (tradesContainer) {
        const pnlClass = isProfit ? 'text-emerald-400' : 'text-red-400';
        const sign = isProfit ? '+' : '';
        const dotColor = trade.position_type === 'CE' ? 'bg-emerald-500' : 'bg-red-500';
        const badgeColor = trade.position_type === 'CE' 
            ? 'text-emerald-400 bg-emerald-400/[0.06] border-emerald-400/[0.1]' 
            : 'text-red-400 bg-red-400/[0.06] border-red-400/[0.1]';
        
        const newCard = document.createElement('div');
        newCard.id = `trade-row-${trade.id}`;
        newCard.className = `flex items-center justify-between p-2.5 rounded-xl hover:bg-white/[0.02] transition-colors border border-transparent hover:border-white/[0.04] group ${isProfit ? 'flash-profit' : 'flash-loss'}`;
        newCard.innerHTML = `
            <div class="flex items-center gap-2.5">
                <div class="w-1.5 h-1.5 rounded-full ${dotColor}"></div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold border rounded px-1.5 py-0.5 ${badgeColor}">${trade.position_type}</span>
                        ${getTagHTML(trade.ai_tag || 'ANALYZING')}
                    </div>
                    <p class="text-[10px] text-gray-600 font-mono mt-0.5">${trade.time.substring(0,8)}</p>
                </div>
            </div>
            <p class="font-mono text-xs font-bold ${pnlClass}">${sign}₹${Math.abs(trade.pnl).toFixed(2)}</p>
        `;
        
        // Clear empty state
        if (state.totalTrades === 1 && tradesContainer.firstElementChild && tradesContainer.firstElementChild.innerText.includes('Waiting')) {
            tradesContainer.innerHTML = '';
        }
        tradesContainer.insertBefore(newCard, tradesContainer.firstChild);
    }

    // Inject into legacy tbody if present
    const tbody = document.getElementById('trades-tbody');
    if (tbody) {
        const colorClass = trade.position_type === 'CE' ? 'text-emerald-400' : 'text-red-400';
        const pnlClass = isProfit ? 'text-emerald-400' : 'text-red-400';
        const sign = isProfit ? '+' : '';
        const timeLabel = trade.time.substring(0, 5);

        const newRow = document.createElement('tr');
        newRow.id = `trade-row-${trade.id}`;
        newRow.className = `hover:bg-white/[0.02] transition-colors group ${isProfit ? 'flash-profit' : 'flash-loss'}`;
        newRow.innerHTML = `
            <td class="py-2.5 text-gray-600 font-mono text-xs">${timeLabel}</td>
            <td class="py-2.5 font-bold ${colorClass}">
                <div class="flex items-center gap-2">
                    <span class="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.03]">${trade.position_type}</span>
                    ${getTagHTML(trade.ai_tag || 'ANALYZING')}
                </div>
            </td>
            <td class="py-2.5 font-mono font-bold text-right text-xs ${pnlClass}">${sign}₹${Math.abs(trade.pnl).toFixed(2)}</td>
        `;
        
        if (state.totalTrades === 1 && tbody.firstElementChild && tbody.firstElementChild.cells && tbody.firstElementChild.cells.length === 1) {
            tbody.innerHTML = '';
        }
        
        tbody.insertBefore(newRow, tbody.firstChild);
    }

    // ⚡ AUTONOMOUS CIRCUIT BREAKER ⚡
    if (state.systemStatus === 'ACTIVE') {
        if (state.dailyPnL <= state.maxDrawdown) {
            triggerHalt(`Max Drawdown breached (₹${state.dailyPnL.toFixed(0)})`);
        } else if (state.consecutiveLosses >= state.maxConsecutiveLosses) {
            triggerHalt(`${state.consecutiveLosses} consecutive losses hit`);
        }
    }
}

// Update Top Metrics UI
function updateTopMetrics() {
    const capitalEl = document.getElementById('ui-capital');
    if (capitalEl) capitalEl.innerText = '₹40,000';

    const pnlEl = document.getElementById('ui-pnl');
    const pnlCard = document.getElementById('pnl-card');
    const isProfit = state.dailyPnL >= 0;
    
    if (pnlEl) {
        const prevText = pnlEl.innerText;
        const newText = (state.dailyPnL >= 0 ? '+' : '') + '₹' + Math.abs(state.dailyPnL).toFixed(2);
        pnlEl.innerText = newText;

        if (prevText !== '...' && prevText !== newText && pnlCard) {
            pnlCard.classList.remove('flash-profit', 'flash-loss');
            void pnlCard.offsetWidth;
            pnlCard.classList.add(isProfit ? 'flash-profit' : 'flash-loss');
        }
    }
    
    if (pnlCard) {
        if (isProfit) {
            pnlCard.className = 'rounded-2xl p-4 md:p-5 relative overflow-hidden bg-gradient-to-br from-emerald-500/80 to-teal-600/80 border border-emerald-400/40 shadow-[0_4px_24px_rgba(16,185,129,0.15)] transition-all duration-300';
        } else {
            pnlCard.className = 'rounded-2xl p-4 md:p-5 relative overflow-hidden bg-gradient-to-br from-red-500/80 to-rose-600/80 border border-red-400/40 shadow-[0_4px_24px_rgba(239,68,68,0.15)] transition-all duration-300';
        }
    }

    const winRate = state.totalTrades > 0 ? Math.round((state.wins / state.totalTrades) * 100) : 0;
    const winRateEl = document.getElementById('ui-winrate');
    if (winRateEl) winRateEl.innerText = winRate + '%';

    const tradesEl = document.getElementById('ui-trades');
    if (tradesEl) tradesEl.innerText = state.totalTrades;
}

// Render chart
function renderChart(labels, chartData) {
    const chartEl = document.getElementById('mobileChart');
    if (chartEl) {
        const ctx = chartEl.getContext('2d');
        const isProfit = state.dailyPnL >= 0;
        const lineColor = isProfit ? '#10b981' : '#ef4444';

        Chart.defaults.color = '#4b5563';
        Chart.defaults.font.family = 'Inter';
        Chart.defaults.font.size = 11;

        if (!myChart) {
            myChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: chartData,
                        borderColor: lineColor,
                        backgroundColor: createGradient(ctx, isProfit),
                        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0,
                        pointHitRadius: 10, pointHoverRadius: 5, pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: lineColor, pointHoverBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { 
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(12, 10, 20, 0.95)',
                            borderColor: 'rgba(255,255,255,0.06)',
                            borderWidth: 1,
                            padding: 10,
                            titleColor: '#9ca3af',
                            bodyFont: { family: 'JetBrains Mono', size: 11 }
                        }
                    },
                    scales: { 
                        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 10 } } }, 
                        y: { grid: { color: 'rgba(255,255,255,0.02)' }, border: { display: false } } 
                    }
                }
            });
        } else {
            myChart.data.labels = labels;
            myChart.data.datasets[0].data = chartData;
            myChart.data.datasets[0].borderColor = lineColor;
            myChart.data.datasets[0].backgroundColor = createGradient(ctx, isProfit);
            myChart.update('none');
        }
    }
}

// Render trade tables
function renderTable(tableTrades) {
    const tbody = document.getElementById('trades-tbody');
    if (tbody) {
        if (!tableTrades || tableTrades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="py-12 text-center text-gray-600 italic text-xs">No executions found</td></tr>';
        } else {
            tbody.innerHTML = tableTrades.map(t => {
                const tIsProfit = t.pnl >= 0;
                const colorClass = t.position_type === 'CE' ? 'text-emerald-400' : 'text-red-400';
                const pnlClass = tIsProfit ? 'text-emerald-400' : 'text-red-400';
                const sign = tIsProfit ? '+' : '';
                return `
                <tr id="trade-row-${t.id}" class="hover:bg-white/[0.02] transition-colors group">
                    <td class="py-2.5 text-gray-600 font-mono text-xs">${t.time.substring(0, 5)}</td>
                    <td class="py-2.5 font-bold ${colorClass}">
                        <div class="flex items-center gap-2">
                            <span class="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.03]">${t.position_type}</span>
                            ${getTagHTML(t.ai_tag)}
                        </div>
                    </td>
                    <td class="py-2.5 font-mono font-bold text-right text-xs ${pnlClass}">${sign}₹${Math.abs(t.pnl).toFixed(2)}</td>
                </tr>
                `;
            }).join('');
        }
    }

    const tradesContainer = document.getElementById('trades-container');
    if (tradesContainer && tableTrades) {
        if (tableTrades.length === 0) {
            tradesContainer.innerHTML = '<div class="flex items-center justify-center h-full text-gray-600 text-xs italic">Waiting for executions...</div>';
        } else {
            tradesContainer.innerHTML = tableTrades.map(t => {
                const tIsProfit = t.pnl >= 0;
                const dotColor = t.position_type === 'CE' ? 'bg-emerald-500' : 'bg-red-500';
                const badgeColor = t.position_type === 'CE' 
                    ? 'text-emerald-400 bg-emerald-400/[0.06] border-emerald-400/[0.1]' 
                    : 'text-red-400 bg-red-400/[0.06] border-red-400/[0.1]';
                const pnlClass = tIsProfit ? 'text-emerald-400' : 'text-red-400';
                const sign = tIsProfit ? '+' : '';
                return `
                <div id="trade-row-${t.id}" class="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/[0.02] transition-colors border border-transparent hover:border-white/[0.04] group">
                    <div class="flex items-center gap-2.5">
                        <div class="w-1.5 h-1.5 rounded-full ${dotColor}"></div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold border rounded px-1.5 py-0.5 ${badgeColor}">${t.position_type}</span>
                                ${getTagHTML(t.ai_tag)}
                            </div>
                            <p class="text-[10px] text-gray-600 font-mono mt-0.5">${t.time.substring(0,8)}</p>
                        </div>
                    </div>
                    <p class="font-mono text-xs font-bold ${pnlClass}">${sign}₹${Math.abs(t.pnl).toFixed(2)}</p>
                </div>
                `;
            }).join('');
        }
    }
}

// Sync Status Indicator
function setSyncStatus(text, color) {
    const indicator = document.getElementById('sync-indicator');
    const textEl = document.getElementById('sync-text');
    
    if (textEl && indicator) {
        textEl.innerText = text;
        if (color === 'green') {
            indicator.className = 'glass-card px-3.5 py-1.5 rounded-full flex items-center gap-2 text-[11px] text-emerald-400 border border-emerald-500/20';
            const dot = indicator.querySelector('div');
            if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 status-dot-active';
        } else {
            indicator.className = 'glass-card px-3.5 py-1.5 rounded-full flex items-center gap-2 text-[11px] text-amber-400 border border-amber-500/20';
            const dot = indicator.querySelector('div');
            if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        }
    }
}

// Boot the terminal
fetchInitialData();

// Expose Global UI Functions
window.killSwitch = async function() {
    if (confirm("🚨 WARNING: Market-sell open positions and halt the local engine. Proceed?")) {
        await fetch('/api/panic', { method: 'POST' });
        alert("Panic signal sent.");
    }
};
window.analyzeDay = async function() {
    const box = document.getElementById('ai-summary-box');
    if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2 text-blue-400/60"></i> <span class="text-gray-500">Analyzing microstructure...</span>';
    try {
        const res = await fetch('/api/analyze');
        const data = await res.json();
        box.innerHTML = '<span class="font-semibold text-blue-300/80 block mb-1 text-[10px] uppercase tracking-wider">AI Analyst</span><span class="text-gray-400">' + data.summary + '</span>';
    } catch (e) {
        box.innerHTML = '<span class="text-gray-600">Analysis unavailable.</span>';
    }
};

// Halt + System Status
async function triggerHalt(reason) {
    console.warn(`🛑 CIRCUIT BREAKER TRIPPED: ${reason}`);
    updateSystemStatusUI('HALTED');
    
    try {
        await fetch('/api/halt', { method: 'POST' });
    } catch (e) {
        console.error("Failed to send halt signal to edge.");
    }
}

function updateSystemStatusUI(status) {
    state.systemStatus = status;
    const textEl = document.getElementById('ui-system-status');
    const iconBg = document.getElementById('status-icon-bg');
    const icon = document.getElementById('status-icon');

    if (!textEl || !iconBg || !icon) return;

    if (status === 'ACTIVE') {
        textEl.innerText = 'ACTIVE';
        textEl.className = 'text-emerald-400 glow-green';
        iconBg.className = 'w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 flex-shrink-0';
        icon.className = 'fas fa-shield-halved text-emerald-400 text-sm';
    } else {
        textEl.innerText = 'HALTED';
        textEl.className = 'text-red-500 glow-red animate-pulse';
        iconBg.className = 'w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-[0_0_16px_rgba(239,68,68,0.3)] flex-shrink-0';
        icon.className = 'fas fa-lock text-red-500 text-sm';
    }
}

window.saveRiskConfig = async function() {
    const inputMaxDd = document.getElementById('input-max-dd');
    const inputMaxLoss = document.getElementById('input-max-loss');
    if (!inputMaxDd || !inputMaxLoss) return;

    const dd = parseFloat(inputMaxDd.value);
    const loss = parseInt(inputMaxLoss.value);
    
    state.maxDrawdown = dd;
    state.maxConsecutiveLosses = loss;
    
    await fetch('/api/risk-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxDrawdown: dd, maxConsecutiveLosses: loss })
    });
    
    updateSystemStatusUI('ACTIVE');
};
