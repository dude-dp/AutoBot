import type { FC } from 'hono/jsx'
import { TopBar } from './TopBar'

type StatsProps = {
  totalTrades: number
  winRate: number
  totalPnL: number
  ceWinRate: number
  peWinRate: number
  chartLabels: string[]
  chartData: number[]
  heatmapLabels: string[]
  heatmapStats: any[]
}

export const Statistics: FC<StatsProps> = ({ 
  totalTrades, winRate, totalPnL, ceWinRate, peWinRate, chartLabels, chartData, heatmapLabels, heatmapStats
}) => {
  const isProfit = totalPnL >= 0;
  const grossProfit = heatmapStats.reduce((s, h) => s + (h.pnl > 0 ? h.pnl : 0), 0);
  const grossLoss = heatmapStats.reduce((s, h) => s + (h.pnl < 0 ? Math.abs(h.pnl) : 0), 0);
  const globalPF = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';
  const avgPnl = totalTrades > 0 ? (totalPnL / totalTrades).toFixed(0) : '0';
  
  return (
    <div class="flex flex-col h-full animate-fade-in pb-8">
      <TopBar title="System Analytics" />
      
      {/* Top Metrics Row */}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-4 md:mb-5">
        {/* Net PnL */}
        <div class="glass-card rounded-2xl p-4 md:p-5 relative overflow-hidden">
          <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Net PnL</p>
          <h3 class={`text-xl md:text-2xl font-bold font-mono ${isProfit ? 'text-emerald-400 glow-green' : 'text-red-400 glow-red'}`}>
            {isProfit ? '+' : ''}₹{Math.abs(totalPnL).toFixed(0)}
          </h3>
        </div>
        
        {/* Win Rate */}
        <div class="glass-card rounded-2xl p-4 md:p-5">
          <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Win Rate</p>
          <h3 class="text-xl md:text-2xl font-bold font-mono text-blue-400">{winRate}%</h3>
        </div>
        
        {/* Total Trades */}
        <div class="glass-card rounded-2xl p-4 md:p-5">
          <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Executions</p>
          <h3 class="text-xl md:text-2xl font-bold font-mono text-violet-400">{totalTrades}</h3>
        </div>

        {/* Profit Factor */}
        <div class="glass-card rounded-2xl p-4 md:p-5">
          <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Profit Factor</p>
          <h3 class={`text-xl md:text-2xl font-bold font-mono ${Number(globalPF) >= 1.5 ? 'text-emerald-400' : Number(globalPF) >= 1 ? 'text-amber-400' : 'text-red-400'}`}>{globalPF}</h3>
        </div>

        {/* Avg PnL */}
        <div class="glass-card rounded-2xl p-4 md:p-5 col-span-2 sm:col-span-1">
          <p class="text-[9px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Avg / Trade</p>
          <h3 class={`text-xl md:text-2xl font-bold font-mono ${Number(avgPnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>₹{avgPnl}</h3>
        </div>
      </div>

      {/* Row 2: Daily PnL & Contract Performance */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-5">
        <div class="glass-card rounded-2xl p-4 md:p-5 lg:col-span-2 flex flex-col min-h-[240px] md:min-h-[300px]">
          <div class="flex justify-between items-center border-b border-white/[0.04] pb-3 mb-3">
            <div>
              <h3 class="font-semibold text-gray-300 text-sm">Daily PnL Distribution</h3>
              <p class="text-[10px] text-gray-600 mt-0.5">Last 14 trading sessions</p>
            </div>
          </div>
          <div class="relative flex-1 w-full"><canvas id="pnlBarChart"></canvas></div>
        </div>
        
        <div class="glass-card rounded-2xl p-4 md:p-5 flex flex-col min-h-[240px] md:min-h-[300px]">
          <div class="border-b border-white/[0.04] pb-3 mb-3">
            <h3 class="font-semibold text-gray-300 text-sm">Contract Edge</h3>
            <p class="text-[10px] text-gray-600 mt-0.5">CE vs PE win rate comparison</p>
          </div>
          <div class="relative flex-1 w-full flex items-center justify-center min-h-[140px]"><canvas id="contractDoughnut"></canvas></div>
          <div class="mt-4 space-y-2.5">
            <div class="flex justify-between items-center text-xs">
              <span class="flex items-center gap-2 text-gray-500">
                <div class="w-2 h-2 rounded-full bg-emerald-400"></div>Call (CE)
              </span>
              <span class="font-mono font-bold text-gray-300">{ceWinRate}%</span>
            </div>
            <div class="flex justify-between items-center text-xs">
              <span class="flex items-center gap-2 text-gray-500">
                <div class="w-2 h-2 rounded-full bg-red-400"></div>Put (PE)
              </span>
              <span class="font-mono font-bold text-gray-300">{peWinRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Time-of-Day Profit Matrix */}
      <div class="glass-card rounded-2xl p-4 md:p-5 flex flex-col min-h-[320px] md:min-h-[400px]">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 border-b border-white/[0.04] pb-3 gap-3">
            <div>
                <h3 class="font-semibold text-gray-300 text-sm">Time-of-Day Profit Matrix</h3>
                <p class="text-[10px] text-gray-600 mt-0.5">15-min windows color-coded by Profit Factor intensity</p>
            </div>
            <div class="flex flex-wrap gap-3 text-[9px] font-mono text-gray-600">
                <span class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded-sm bg-emerald-500/80"></div>PF ≥ 1.5</span>
                <span class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded-sm bg-white/10"></div>Breakeven</span>
                <span class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded-sm bg-red-500/50"></div>Loss Zone</span>
            </div>
        </div>
        <div class="relative flex-1 w-full">
          <canvas id="heatmapChart"></canvas>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
        Chart.defaults.color = '#4b5563';
        Chart.defaults.font.family = 'Inter';
        Chart.defaults.font.size = 11;

        // 1. Daily Bar Chart
        const barCtx = document.getElementById('pnlBarChart').getContext('2d');
        const rawData = ${JSON.stringify(chartData)};
        new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(chartLabels)},
                datasets: [{
                    data: rawData,
                    backgroundColor: rawData.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                    borderColor: rawData.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'),
                    borderWidth: 1, borderRadius: 3
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 7, font: { size: 10 } } }, 
                    y: { grid: { color: 'rgba(255,255,255,0.02)' }, border: { display: false } } 
                } 
            }
        });

        // 2. Contract Doughnut
        const doughnutCtx = document.getElementById('contractDoughnut').getContext('2d');
        new Chart(doughnutCtx, {
            type: 'doughnut',
            data: { 
                labels: ['CE', 'PE'], 
                datasets: [{ 
                    data: [${ceWinRate}, ${peWinRate}], 
                    backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(239, 68, 68, 0.7)'], 
                    borderWidth: 0,
                    spacing: 2
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '78%', 
                plugins: { legend: { display: false } } 
            }
        });

        // 3. Time-Of-Day Heatmap
        const heatCtx = document.getElementById('heatmapChart').getContext('2d');
        const heatLabels = ${JSON.stringify(heatmapLabels)};
        const heatStats = ${JSON.stringify(heatmapStats)};
        
        const heatPnl = heatStats.map(s => s.pnl);
        const heatColors = heatStats.map(s => {
            if (s.total === 0) return 'rgba(255,255,255,0.015)';
            if (s.pnl < 0) return 'rgba(239, 68, 68, 0.4)';
            if (s.pf >= 2.0) return 'rgba(16, 185, 129, 0.8)';
            if (s.pf >= 1.2) return 'rgba(16, 185, 129, 0.4)';
            return 'rgba(255, 255, 255, 0.06)';
        });

        new Chart(heatCtx, {
            type: 'bar',
            data: {
                labels: heatLabels,
                datasets: [{
                    label: 'Net PnL',
                    data: heatPnl,
                    backgroundColor: heatColors,
                    borderRadius: 3,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(12, 10, 20, 0.95)',
                        borderColor: 'rgba(255,255,255,0.06)',
                        borderWidth: 1,
                        padding: 12,
                        titleColor: '#9ca3af',
                        bodyFont: { family: 'JetBrains Mono', size: 11 },
                        callbacks: {
                            afterLabel: function(context) {
                                const stat = heatStats[context.dataIndex];
                                if(stat.total === 0) return 'No executions';
                                return [
                                    'Win Rate: ' + stat.wr + '%',
                                    'Profit Factor: ' + stat.pf,
                                    'Executions: ' + stat.total
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 }, maxTicksLimit: window.innerWidth < 768 ? 8 : 24 } },
                    y: { grid: { color: 'rgba(255,255,255,0.02)' }, border: { display: false } }
                }
            }
        });
        `
      }} />
    </div>
  )
}
