import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// 1. Initialize Supabase Client using injected Edge ENV
const supabase = createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_KEY);

let myChart = null;

// State management for live calculations
let state = {
    dailyPnL: 0,
    totalTrades: 0,
    wins: 0,
    cumulativePnL: 0
};

// Gradient Helper for Chart.js
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

        updateTopMetrics();
        renderChart(data.chartLabels, data.chartData);
        renderTable(data.tableTrades);
        
        // Start WebSocket Listener once initial state is loaded
        setupRealtime();

    } catch (err) {
        setSyncStatus('OFFLINE', 'yellow');
    }
}

// 3. WebSocket Real-Time Subscription
function setupRealtime() {
    supabase
        .channel('trade_updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trade_log' }, (payload) => {
            const trade = payload.new;
            handleLiveExecution(trade);
        })
        .subscribe((status) => {
            if(status === 'SUBSCRIBED') {
                setSyncStatus('REALTIME', 'green');
            }
        });
}

// 4. Live Execution Handler (The God-Mode Updates)
function handleLiveExecution(trade) {
    const isProfit = trade.pnl >= 0;
    
    // Update State Calculations
    state.dailyPnL += trade.pnl;
    state.totalTrades += 1;
    if (isProfit) state.wins += 1;
    state.cumulativePnL += trade.pnl;

    updateTopMetrics();

    // Update Chart Live
    if (myChart) {
        const timeLabel = trade.time.substring(0, 5);
        myChart.data.labels.push(timeLabel);
        myChart.data.datasets[0].data.push(state.cumulativePnL.toFixed(2));
        
        // Dynamically shift chart gradient if PnL flips from red to green
        const globalIsProfit = state.dailyPnL >= 0;
        const ctx = document.getElementById('mobileChart').getContext('2d');
        myChart.data.datasets[0].borderColor = globalIsProfit ? '#10b981' : '#ef4444';
        myChart.data.datasets[0].backgroundColor = createGradient(ctx, globalIsProfit);
        
        myChart.update('none'); // Update instantly without long animation delays
    }

    // Inject New Row into Table Live if tbody exists
    const tbody = document.getElementById('trades-tbody');
    const colorClass = trade.position_type === 'CE' ? 'text-green-400' : 'text-red-400';
    const pnlClass = isProfit ? 'text-green-400' : 'text-red-400';
    const sign = isProfit ? '+' : '';
    const timeLabel = trade.time.substring(0, 5);

    if (tbody) {
        const newRow = document.createElement('tr');
        newRow.className = `hover:bg-white/5 transition-colors group ${isProfit ? 'flash-profit' : 'flash-loss'}`;
        newRow.innerHTML = `
            <td class="py-3 text-gray-500 font-mono">${timeLabel}</td>
            <td class="py-3 font-bold ${colorClass}"><span class="px-2 py-0.5 rounded bg-white/5">${trade.position_type}</span></td>
            <td class="py-3 font-mono font-bold text-right ${pnlClass} group-hover:scale-105 transition-transform">${sign}₹${Math.abs(trade.pnl).toFixed(2)}</td>
        `;
        
        // Remove empty state message if it's the first trade
        if (state.totalTrades === 1 && tbody.firstElementChild && tbody.firstElementChild.cells && tbody.firstElementChild.cells.length === 1) {
            tbody.innerHTML = '';
        }
        
        // Prepend to top of table
        tbody.insertBefore(newRow, tbody.firstChild);
    }

    // Also support trades-container if it is present
    const tradesContainer = document.getElementById('trades-container');
    if (tradesContainer) {
        const bgDot = trade.position_type === 'CE' ? 'bg-green-500' : 'bg-red-500';
        const newCard = document.createElement('div');
        newCard.className = `flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/10 group ${isProfit ? 'flash-profit' : 'flash-loss'}`;
        newCard.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-2 h-2 rounded-full ${bgDot}"></div>
                <div>
                    <p class="text-sm font-semibold">${trade.position_type}</p>
                    <p class="text-xs text-gray-500 font-mono">${trade.time.substring(0,8)}</p>
                </div>
            </div>
            <p class="font-mono text-sm group-hover:scale-105 transition-transform ${pnlClass}">${sign}₹${Math.abs(trade.pnl).toFixed(2)}</p>
        `;
        if (state.totalTrades === 1 && tradesContainer.firstElementChild && tradesContainer.firstElementChild.innerText.includes('No trades')) {
            tradesContainer.innerHTML = '';
        }
        tradesContainer.insertBefore(newCard, tradesContainer.firstChild);
    }
}

// Update Top Metrics UI and trigger flash animations
function updateTopMetrics() {
    // Update Available Capital
    const capitalEl = document.getElementById('ui-capital');
    if (capitalEl) {
        capitalEl.innerText = '₹40,000';
    }

    const pnlEl = document.getElementById('ui-pnl');
    const pnlCard = document.getElementById('pnl-card');
    const isProfit = state.dailyPnL >= 0;
    
    if (pnlEl) {
        const prevText = pnlEl.innerText;
        const newText = (state.dailyPnL >= 0 ? '+' : '') + '₹' + Math.abs(state.dailyPnL).toFixed(2);
        pnlEl.innerText = newText;

        // If the value changed, trigger card flash animation
        if (prevText !== '...' && prevText !== newText && pnlCard) {
            pnlCard.classList.remove('flash-profit', 'flash-loss');
            void pnlCard.offsetWidth; // Trigger DOM reflow to restart animation
            pnlCard.classList.add(isProfit ? 'flash-profit' : 'flash-loss');
        }
    }
    
    if (pnlCard) {
        if (isProfit) {
            pnlCard.className = 'rounded-3xl p-6 relative overflow-hidden bg-gradient-to-br from-emerald-500/80 to-teal-600/80 border border-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.2)] transform hover:-translate-y-1 transition-all duration-300';
        } else {
            pnlCard.className = 'rounded-3xl p-6 relative overflow-hidden bg-gradient-to-br from-red-500/80 to-rose-600/80 border border-red-400/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] transform hover:-translate-y-1 transition-all duration-300';
        }
    }

    const winRate = state.totalTrades > 0 ? Math.round((state.wins / state.totalTrades) * 100) : 0;
    const winRateEl = document.getElementById('ui-winrate');
    if (winRateEl) {
        winRateEl.innerText = winRate + '%';
    }

    const tradesEl = document.getElementById('ui-trades');
    if (tradesEl) {
        tradesEl.innerText = state.totalTrades;
    }
}

// Render chart using Chart.js
function renderChart(labels, chartData) {
    const chartEl = document.getElementById('mobileChart');
    if (chartEl) {
        const ctx = chartEl.getContext('2d');
        const isProfit = state.dailyPnL >= 0;
        const lineColor = isProfit ? '#10b981' : '#ef4444';

        if (!myChart) {
            Chart.defaults.color = '#94a3b8';
            Chart.defaults.font.family = 'Inter';
            myChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: chartData,
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
            myChart.data.labels = labels;
            myChart.data.datasets[0].data = chartData;
            myChart.data.datasets[0].borderColor = lineColor;
            myChart.data.datasets[0].backgroundColor = createGradient(ctx, isProfit);
            myChart.update('none');
        }
    }
}

// Render historical tables
function renderTable(tableTrades) {
    const tbody = document.getElementById('trades-tbody');
    if (tbody) {
        if (!tableTrades || tableTrades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="py-12 text-center text-gray-500 italic">No executions found in database.</td></tr>';
        } else {
            tbody.innerHTML = tableTrades.map(t => {
                const tIsProfit = t.pnl >= 0;
                const colorClass = t.position_type === 'CE' ? 'text-green-400' : 'text-red-400';
                const pnlClass = tIsProfit ? 'text-green-400' : 'text-red-400';
                const sign = tIsProfit ? '+' : '';
                return `
                <tr class="hover:bg-white/5 transition-colors group">
                    <td class="py-3 text-gray-500 font-mono">${t.time.substring(0, 5)}</td>
                    <td class="py-3 font-bold ${colorClass}"><span class="px-2 py-0.5 rounded bg-white/5">${t.position_type}</span></td>
                    <td class="py-3 font-mono font-bold text-right ${pnlClass} group-hover:scale-105 transition-transform">${sign}₹${Math.abs(t.pnl).toFixed(2)}</td>
                </tr>
                `;
            }).join('');
        }
    }

    const tradesContainer = document.getElementById('trades-container');
    if (tradesContainer && tableTrades) {
        if (tableTrades.length === 0) {
            tradesContainer.innerHTML = '<div class="text-center text-gray-500 italic py-10">No trades executed today</div>';
        } else {
            tradesContainer.innerHTML = tableTrades.map(t => {
                const tIsProfit = t.pnl >= 0;
                const bgDot = t.position_type === 'CE' ? 'bg-green-500' : 'bg-red-500';
                const pnlClass = tIsProfit ? 'text-green-400' : 'text-red-400';
                const sign = tIsProfit ? '+' : '';
                return `
                <div class="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/10 group">
                    <div class="flex items-center gap-3">
                        <div class="w-2 h-2 rounded-full ${bgDot}"></div>
                        <div>
                            <p class="text-sm font-semibold">${t.position_type}</p>
                            <p class="text-xs text-gray-500 font-mono">${t.time.substring(0,8)}</p>
                        </div>
                    </div>
                    <p class="font-mono text-sm group-hover:scale-105 transition-transform ${pnlClass}">${sign}₹${Math.abs(t.pnl).toFixed(2)}</p>
                </div>
                `;
            }).join('');
        }
    }
}

// Helper: Visual Sync Status
function setSyncStatus(text, color) {
    const indicator = document.getElementById('sync-indicator');
    const textEl = document.getElementById('sync-text');
    
    if (textEl && indicator) {
        textEl.innerText = text;
        if (color === 'green') {
            indicator.className = 'glass-card px-4 py-2 rounded-full flex items-center gap-2 text-sm text-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]';
            const dot = indicator.querySelector('div');
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-green-400 animate-pulse';
        } else {
            indicator.className = 'glass-card px-4 py-2 rounded-full flex items-center gap-2 text-sm text-yellow-400 border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.15)]';
            const dot = indicator.querySelector('div');
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-yellow-400';
        }
    }
}

// Boot the terminal
fetchInitialData();

// Expose Global UI Functions for the buttons
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
    box.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Analyzing microstructure...';
    try {
        const res = await fetch('/api/analyze');
        const data = await res.json();
        box.innerHTML = '<span class="font-semibold block mb-1">AI Analyst:</span>' + data.summary;
    } catch (e) {
        box.innerHTML = 'Analysis unavailable.';
    }
};
