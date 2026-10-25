import React, { useState, useEffect } from 'react';
import {
  Eye,
  Layers,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

interface ResultsPayload {
  run: {
    id: string;
    label: string;
    weeksPlayed: number;
    engineVersion: string;
  };
  benchmark: {
    policy: string;
    teamTotalCents: number;
    perEchelonTotalCents?: number[];
    series: Array<{
      week: number;
      orders: number[];
      inventory: number[];
      backlog: number[];
      teamCostCents: number;
      cumCostCents: number;
    }>;
  };
  teams: Array<{
    id: string;
    name: string;
    totalCents: number;
    byEchelon: Array<{
      echelon: number;
      totalCents: number;
      holdCents: number;
      backCents: number;
      bullwhipRatio: number;
      stageAmplification: number;
      inventoryVarianceRatio: number;
      peakToTrough: number;
      serviceLevel: number;
      fillRate: number;
      weeks: Array<{
        week: number;
        inventory: number;
        backlog: number;
        incomingOrder: number;
        shipped: number;
        orderPlaced: number;
        pipeline: number[];
        weekCostCents: number;
        cumCostCents: number;
      }>;
    }>;
    predictions: any[];
    utterances: any[];
  }>;
  demand: number[];
}

interface Props {
  runId: string;
}

const ECHELON_NAMES = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
const ECHELON_COLORS = ['#38bdf8', '#818cf8', '#c084fc', '#f472b6'];

export const DebriefView: React.FC<Props> = ({ runId }) => {
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [revealedEchelon, setRevealedEchelon] = useState<number>(0); // 0 = Retailer only, 3 = Factory
  const [selectedTeamIdx, setSelectedTeamIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/lab/api/runs/${runId}/results`)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load debrief data:', err);
        setLoading(false);
      });
  }, [runId]);

  // Arrow key navigation (§5.3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCurrentSlide(prev => Math.min(prev + 1, 7));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide(prev => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Computing Debrief Analytics...</span>
        </div>
      </div>
    );
  }

  const team = data.teams[selectedTeamIdx] || data.teams[0];

  // Prepare synchronized order comparison series
  const orderSeries = data.demand.map((d, idx) => {
    const week = idx + 1;
    const point: any = { week, customerDemand: d };
    team.byEchelon.forEach(ech => {
      const rec = ech.weeks.find(w => w.week === week);
      point[ECHELON_NAMES[ech.echelon]] = rec ? rec.orderPlaced : 0;
    });
    return point;
  });

  // Calculate global max order across all echelons for synchronized Y-axis (§5.3 slide 2)
  let maxOrderValue = 16;
  orderSeries.forEach(p => {
    ECHELON_NAMES.forEach(name => {
      if (p[name] && p[name] > maxOrderValue) {
        maxOrderValue = p[name];
      }
    });
  });
  // Add 10% breathing room
  const synchronizedYMax = Math.ceil(maxOrderValue * 1.1);

  // Prepare inventory & backlog series (signed: inventory positive, backlog negative)
  const inventorySeries = data.demand.map((_, idx) => {
    const week = idx + 1;
    const point: any = { week };
    team.byEchelon.forEach(ech => {
      const rec = ech.weeks.find(w => w.week === week);
      // Net stock = inventory - backlog
      point[ECHELON_NAMES[ech.echelon]] = rec ? rec.inventory - rec.backlog : 0;
    });
    return point;
  });

  // Cumulative cost series with benchmark comparison
  const costSeries = data.demand.map((_, idx) => {
    const week = idx + 1;
    let actualTeamCum = 0;
    team.byEchelon.forEach(ech => {
      const rec = ech.weeks.find(w => w.week === week);
      if (rec) actualTeamCum += rec.cumCostCents;
    });

    const benchRec = data.benchmark?.series?.[idx];
    const benchCum = benchRec ? benchRec.cumCostCents : 0;

    return {
      week,
      actualTeamCost: actualTeamCum / 100,
      optimalBenchmark: benchCum / 100
    };
  });

  const slides = [
    {
      title: 'Slide 1: The Reality of End-Customer Demand',
      subtitle: 'What actually happened downstream: consumer demand was essentially steady.',
      render: () => (
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={orderSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="week" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" domain={[0, 16]} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
              <Legend />
              <Line
                type="stepAfter"
                dataKey="customerDemand"
                stroke="#10b981"
                strokeWidth={3}
                name="End-Customer Demand (Constant 4, Step to 8)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )
    },
    {
      title: 'Slide 2: The Bullwhip Effect Across Echelons',
      subtitle: 'Notice the radical oscillation upstream despite flat customer demand. (Synchronized Y-axis)',
      render: () => (
        <div className="space-y-4">
          {/* Stepwise reveal control (§5.3) */}
          <div className="flex items-center space-x-2 bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5 pl-2">
              <Eye className="w-4 h-4 text-sky-400" />
              <span>Reveal Echelons:</span>
            </span>
            <div className="flex space-x-1">
              {ECHELON_NAMES.map((name, idx) => (
                <button
                  key={name}
                  onClick={() => setRevealedEchelon(idx)}
                  className={`px-3 py-1 text-xs font-bold rounded-xl border transition ${
                    revealedEchelon >= idx
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-800 text-slate-500 border-transparent'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={orderSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="week" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[0, synchronizedYMax]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Legend />
                <Line
                  type="stepAfter"
                  dataKey="customerDemand"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  name="Customer Demand"
                  dot={false}
                />
                {ECHELON_NAMES.slice(0, revealedEchelon + 1).map((name, idx) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={ECHELON_COLORS[idx]}
                    strokeWidth={2.5}
                    name={`Orders: ${name}`}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    },
    {
      title: 'Slide 3: Net Inventory & Backlog Over Time',
      subtitle: 'Positive values represent physical inventory holding; negative values indicate stockout backlog.',
      render: () => (
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={inventorySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="week" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
              <Legend />
              {ECHELON_NAMES.map((name, idx) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={ECHELON_COLORS[idx]}
                  strokeWidth={2}
                  dot={false}
                  name={`${name} (Net Inventory)`}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )
    },
    {
      title: 'Slide 4: Cumulative Cost vs Optimal Benchmark',
      subtitle: 'The shadow simulation runs four base-stock bots knowing the true pipeline lag.',
      render: () => (
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={costSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="week" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" unit="$" />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
              <Legend />
              <Line
                type="monotone"
                dataKey="actualTeamCost"
                stroke="#f59e0b"
                strokeWidth={3}
                name={`Actual Team Cost: $${(team.totalCents / 100).toFixed(2)}`}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="optimalBenchmark"
                stroke="#10b981"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                name={`Optimal Benchmark: $${(data.benchmark.teamTotalCents / 100).toFixed(2)}`}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )
    },
    {
      title: 'Slide 5: Supply-Line Reveal — Underweighting Pipeline',
      subtitle: "Sterman (1989): Human players systematically ignore orders already placed in transit.",
      render: () => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {team.byEchelon.map((ech, idx) => (
            <div key={idx} className="glass-panel p-4 rounded-2xl border border-white/5 space-y-2">
              <h4 className="text-sm font-bold text-white">{ECHELON_NAMES[idx]}</h4>
              <div className="text-xs text-slate-400">Bullwhip Ratio</div>
              <div className="text-2xl font-black text-sky-400 font-mono">
                {ech.bullwhipRatio.toFixed(2)}x
              </div>
              <div className="text-xs text-slate-400 mt-2">Stage Amplification</div>
              <div className="text-lg font-bold text-indigo-300 font-mono">
                {ech.stageAmplification.toFixed(2)}x
              </div>
              <div className="text-xs text-slate-400 mt-2">Peak to Trough</div>
              <div className="text-sm font-semibold text-slate-200">
                {ech.peakToTrough} units
              </div>
            </div>
          ))}
        </div>
      )
    },
    {
      title: 'Slide 6: Stated Predictions & Reflection Quotes',
      subtitle: 'Direct quotes and mental models captured during the run.',
      render: () => (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {team.utterances.length > 0 ? (
            team.utterances.map((u, idx) => (
              <div key={idx} className="glass-panel p-4 rounded-2xl border border-white/5 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  <span>{u.kind} · Week {u.week ?? 0}</span>
                </div>
                <p className="text-sm text-slate-200 italic leading-relaxed">
                  "{u.body}"
                </p>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-slate-500 text-sm">
              No participant reflection statements recorded for this team.
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Slide 7: Cohort Leaderboard & Cost Split',
      subtitle: 'Comparison of all supply chain teams across the organization.',
      render: () => (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="pb-3">Rank</th>
                <th className="pb-3">Team</th>
                <th className="pb-3">Total Cost</th>
                <th className="pb-3">Bullwhip Amplification</th>
                <th className="pb-3">Holding Cost</th>
                <th className="pb-3">Backlog Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {data.teams
                .slice()
                .sort((a, b) => a.totalCents - b.totalCents)
                .map((t, idx) => {
                  const holdTotal = t.byEchelon.reduce((acc, e) => acc + e.holdCents, 0);
                  const backTotal = t.byEchelon.reduce((acc, e) => acc + e.backCents, 0);
                  const maxBullwhip = Math.max(...t.byEchelon.map(e => e.bullwhipRatio));

                  return (
                    <tr key={t.id} className="hover:bg-slate-900/40">
                      <td className="py-3 font-bold text-sky-400">{idx + 1}</td>
                      <td className="py-3 font-bold text-white font-sans">{t.name}</td>
                      <td className="py-3 font-bold text-amber-400">${(t.totalCents / 100).toFixed(2)}</td>
                      <td className="py-3 text-sky-300">{maxBullwhip.toFixed(2)}x</td>
                      <td className="py-3 text-emerald-400">${(holdTotal / 100).toFixed(2)}</td>
                      <td className="py-3 text-rose-400">${(backTotal / 100).toFixed(2)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )
    },
    {
      title: 'Slide 8: Cross-Run Experimentation (Phase 2)',
      subtitle: 'Comparing Run 1 (Baseline) vs Run 2 (POS Information Sharing / Lean delays).',
      render: () => (
        <div className="glass-panel p-6 rounded-3xl border border-white/5 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-bold text-white">Continuous Learning Loop</h4>
          <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
            In Experiment 2, end-customer demand is shared across all echelons, or transmission lag is eliminated. The learning loop measures whether participants unlearn the supply-line omission bias.
          </p>
          <div className="pt-2">
            <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300">
              Run 1 Completed · Ready for Run 2
            </span>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-full flex flex-col p-4 sm:p-8 max-w-6xl mx-auto w-full space-y-6">
      {/* ── Slide Header ── */}
      <header className="glass-panel rounded-3xl p-6 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xl">
        <div>
          <span className="text-xs uppercase tracking-wider font-extrabold text-sky-400">
            Debrief Presentation · Slide {currentSlide + 1} of {slides.length}
          </span>
          <h1 className="text-2xl font-black text-white tracking-tight">{slides[currentSlide].title}</h1>
          <p className="text-xs text-slate-400 mt-1">{slides[currentSlide].subtitle}</p>
        </div>

        {/* Team selector and slide navigation controls */}
        <div className="flex items-center space-x-2">
          {data.teams.length > 1 && (
            <select
              value={selectedTeamIdx}
              onChange={e => setSelectedTeamIdx(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-slate-800 text-xs font-bold text-white border border-slate-700 outline-none"
            >
              {data.teams.map((t, idx) => (
                <option key={t.id} value={idx}>{t.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
            disabled={currentSlide === 0}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white transition active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))}
            disabled={currentSlide === slides.length - 1}
            className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-white transition active:scale-95"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Slide Canvas ── */}
      <div className="glass-panel rounded-3xl p-6 border border-white/10 shadow-2xl">
        {slides[currentSlide].render()}
      </div>

      {/* ── Slide Dots Footer ── */}
      <footer className="flex items-center justify-between px-2 text-xs text-slate-500">
        <span>Use <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">←</kbd> and <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">→</kbd> to navigate</span>
        <div className="flex space-x-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`h-2 rounded-full transition-all ${
                currentSlide === idx ? 'w-6 bg-sky-400' : 'w-2 bg-slate-700 hover:bg-slate-600'
              }`}
            />
          ))}
        </div>
      </footer>
    </div>
  );
};
