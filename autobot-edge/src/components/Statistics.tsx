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
  
  return (
    <div class="flex flex-col h-full animate-fade-in pb-8">
      <TopBar title="System Analytics" />
      
      {/* Top Metrics Row — stacks on mobile */}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 mb-4 md:mb-6">
        <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 relative overflow-hidden group">
          <p class="text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Total Net PnL</p>
          <h3 class={`text-2xl md:text-3xl font-bold font-mono ${isProfit ? 'text-green-400 glow-green' : 'text-red-400 glow-red'}`}>
            {isProfit ? '+' : ''}₹{Math.abs(totalPnL).toFixed(2)}
          </h3>
        </div>
        <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 relative overflow-hidden">
          <p class="text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Global Win Rate</p>
          <h3 class="text-2xl md:text-3xl font-bold font-mono text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">{winRate}%</h3>
        </div>
        <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 relative overflow-hidden">
          <p class="text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Total Executions</p>
          <h3 class="text-2xl md:text-3xl font-bold font-mono text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]">{totalTrades}</h3>
        </div>
      </div>

      {/* Row 2: Daily PnL & Asset Performance */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-4 md:mb-6">
        <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 lg:col-span-2 flex flex-col min-h-[260px] md:min-h-[340px]">
          <h3 class="font-semibold text-gray-200 mb-4 md:mb-6 text-sm md:text-base">Daily PnL Distribution</h3>
          <div class="relative flex-1 w-full"><canvas id="pnlBarChart"></canvas></div>
        </div>
        <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col min-h-[260px] md:min-h-[340px]">
          <h3 class="font-semibold text-gray-200 mb-4 md:mb-6 text-sm md:text-base">Contract Win Rates</h3>
          <div class="relative flex-1 w-full flex items-center justify-center min-h-[160px] md:min-h-[200px]"><canvas id="contractDoughnut"></canvas></div>
          <div class="mt-4 space-y-2 text-xs md:text-sm">
            <div class="flex justify-between"><span class="text-gray-400">Call (CE)</span><span class="font-mono font-bold text-gray-200">{ceWinRate}% WR</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Put (PE)</span><span class="font-mono font-bold text-gray-200">{peWinRate}% WR</span></div>
          </div>
        </div>
      </div>

      {/* Row 3: The Time-of-Day Heatmap */}
      <div class="glass-card rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col min-h-[360px] md:min-h-[440px] mb-4">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 md:mb-6 border-b border-white/5 pb-4 gap-3">
            <div>
                <h3 class="font-semibold text-gray-200 text-sm md:text-base">Time-of-Day Profit Matrix</h3>
                <p class="text-xs text-gray-400 mt-1">15-minute execution windows analyzed by Net PnL and Profit Factor intensity.</p>
            </div>
            <div class="flex flex-wrap gap-3 md:gap-4 text-[10px] font-mono text-gray-400">
                <span class="flex items-center"><div class="w-3 h-3 rounded-sm bg-emerald-500/80 mr-2"></div> PF &ge; 1.5 (Lethal)</span>
                <span class="flex items-center"><div class="w-3 h-3 rounded-sm bg-gray-500/30 mr-2"></div> PF &lt; 1.0 (Chop)</span>
            </div>
        </div>
        <div class="relative flex-1 w-full">
          <canvas id="heatmapChart"></canvas>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
        Chart.defaults.color = '#64748b';
        Chart.defaults.font.family = 'Inter';

        // 1. Daily Bar Chart
        const barCtx = document.getElementById('pnlBarChart').getContext('2d');
        const rawData = ${JSON.stringify(chartData)};
        new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(chartLabels)},
                datasets: [{
                    data: rawData,
                    backgroundColor: rawData.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                    borderColor: rawData.map(v => v >= 0 ? '#10b981' : '#ef4444'),
                    borderWidth: 1, borderRadius: 4
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } }, 
                    y: { grid: { color: 'rgba(255,255,255,0.03)' }, border: { display: false } } 
                } 
            }
        });

        // 2. Contract Doughnut
        const doughnutCtx = document.getElementById('contractDoughnut').getContext('2d');
        new Chart(doughnutCtx, {
            type: 'doughnut',
            data: { 
                labels: ['CE Win Rate', 'PE Win Rate'], 
                datasets: [{ 
                    data: [${ceWinRate}, ${peWinRate}], 
                    backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(239, 68, 68, 0.8)'], 
                    borderWidth: 0 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '75%', 
                plugins: { legend: { display: false } } 
            }
        });

        // 3. Time-Of-Day Heatmap
        const heatCtx = document.getElementById('heatmapChart').getContext('2d');
        const heatLabels = ${JSON.stringify(heatmapLabels)};
        const heatStats = ${JSON.stringify(heatmapStats)};
        
        const heatPnl = heatStats.map(s => s.pnl);
        const heatColors = heatStats.map(s => {
            if (s.total === 0) return 'rgba(255,255,255,0.02)';
            if (s.pnl < 0) return 'rgba(239, 68, 68, 0.5)'; // Loss window
            if (s.pf >= 2.0) return 'rgba(16, 185, 129, 0.9)'; // Elite edge
            if (s.pf >= 1.2) return 'rgba(16, 185, 129, 0.5)'; // Moderate edge
            return 'rgba(255, 255, 255, 0.1)'; // Breakeven/Chop
        });

        new Chart(heatCtx, {
            type: 'bar',
            data: {
                labels: heatLabels,
                datasets: [{
                    label: 'Net PnL',
                    data: heatPnl,
                    backgroundColor: heatColors,
                    borderRadius: 4,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        padding: 12,
                        titleColor: '#94a3b8',
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
                    y: { grid: { color: 'rgba(255,255,255,0.03)' }, border: { display: false } }
                }
            }
        });
        `
      }} />
    </div>
  )
}
