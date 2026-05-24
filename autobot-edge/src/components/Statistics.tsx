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
}

export const Statistics: FC<StatsProps> = ({ 
  totalTrades, winRate, totalPnL, ceWinRate, peWinRate, chartLabels, chartData 
}) => {
  const isProfit = totalPnL >= 0;
  
  return (
    <div class="flex flex-col h-full animate-fade-in">
      <TopBar title="System Analytics" />
      
      {/* Top Metrics Row */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="glass-card rounded-3xl p-6 relative overflow-hidden group">
          <p class="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Total Net PnL</p>
          <h3 class={`text-3xl font-bold font-mono ${isProfit ? 'text-green-400 glow-green' : 'text-red-400 glow-red'}`}>
            {isProfit ? '+' : ''}₹{Math.abs(totalPnL).toFixed(2)}
          </h3>
        </div>
        <div class="glass-card rounded-3xl p-6 relative overflow-hidden">
          <p class="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Global Win Rate</p>
          <h3 class="text-3xl font-bold font-mono text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">
            {winRate}%
          </h3>
        </div>
        <div class="glass-card rounded-3xl p-6 relative overflow-hidden">
          <p class="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Total Executions</p>
          <h3 class="text-3xl font-bold font-mono text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]">
            {totalTrades}
          </h3>
        </div>
      </div>

      {/* Charts Row */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
        
        {/* Bar Chart: Daily PnL Distribution */}
        <div class="glass-card rounded-3xl p-6 lg:col-span-2 flex flex-col">
          <h3 class="font-semibold text-gray-200 mb-6">Daily PnL Distribution</h3>
          <div class="relative flex-1 w-full min-h-[300px]">
            <canvas id="pnlBarChart"></canvas>
          </div>
        </div>

        {/* Doughnut Chart: CE vs PE Performance */}
        <div class="glass-card rounded-3xl p-6 flex flex-col">
          <h3 class="font-semibold text-gray-200 mb-6">Contract Win Rates</h3>
          <div class="relative flex-1 w-full flex items-center justify-center min-h-[220px]">
            <canvas id="contractDoughnut"></canvas>
          </div>
          <div class="mt-6 space-y-3">
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-400"><i class="fas fa-circle text-green-500 mr-2"></i>Call (CE)</span>
              <span class="font-mono font-bold text-gray-200">{ceWinRate}%</span>
            </div>
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-400"><i class="fas fa-circle text-red-500 mr-2"></i>Put (PE)</span>
              <span class="font-mono font-bold text-gray-200">{peWinRate}%</span>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
        // Initialize Bar Chart
        const barCtx = document.getElementById('pnlBarChart').getContext('2d');
        const rawData = ${JSON.stringify(chartData)};
        const bgColors = rawData.map(val => val >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)');
        const borderColors = rawData.map(val => val >= 0 ? '#10b981' : '#ef4444');

        new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(chartLabels)},
                datasets: [{
                    data: rawData,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    x: { grid: { display: false }, ticks: { color: '#475569' } },
                    y: { grid: { color: 'rgba(255,255,255,0.03)' }, border: { display: false } }
                }
            }
        });

        // Initialize Doughnut Chart
        const doughnutCtx = document.getElementById('contractDoughnut').getContext('2d');
        new Chart(doughnutCtx, {
            type: 'doughnut',
            data: {
                labels: ['CE Win Rate', 'PE Win Rate'],
                datasets: [{
                    data: [${ceWinRate}, ${peWinRate}],
                    backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(239, 68, 68, 0.8)'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '75%',
                plugins: { legend: { display: false } }
            }
        });
        `
      }} />
    </div>
  )
}
