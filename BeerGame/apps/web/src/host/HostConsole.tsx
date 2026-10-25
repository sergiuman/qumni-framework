import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  FastForward,
  Square,
  Users,
  Bot,
  Copy,
  Check,
  Activity,
  PlusCircle,
  ExternalLink
} from 'lucide-react';

interface TeamDelta {
  teamId: string;
  teamName: string;
  week: number;
  seatsHuman: number;
  seatsBot: number;
  pendingSeats: number;
  cumCostCents: number;
  status: string;
}

interface SessionData {
  session: {
    id: string;
    title: string;
    join_code: string;
    status: string;
  };
  runs: Array<{
    id: string;
    label: string;
    status: string;
    weeks_planned: number;
    round_seconds: number | null;
  }>;
  teams: Array<{
    id: string;
    name: string;
    current_week: number;
    status: string;
    seats: Array<{
      id: string;
      echelon: number;
      holder_type: 'human' | 'bot';
      bot_policy: string | null;
      player_id: string | null;
    }>;
  }>;
}

export const HostConsole: React.FC = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [liveTeams, setLiveTeams] = useState<TeamDelta[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [newRunLabel, setNewRunLabel] = useState('Run 2 — POS Information Sharing');

  const fetchSession = async () => {
    try {
      // Create session or load by ID
      const sessRes = await fetch('/lab/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Live Executive Cohort' })
      });
      const newSess = await sessRes.json();

      // Create Run 1
      await fetch(`/lab/api/sessions/${newSess.id}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advancement: 'wait_all', label: 'Run 1 — Baseline' })
      });

      // Create 2 initial teams
      await fetch(`/lab/api/sessions/${newSess.id}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamCount: 2, teamSize: 4, names: ['Team Alpha', 'Team Beta'] })
      });

      // Load full details
      const detailRes = await fetch(`/lab/api/sessions/${newSess.id}`);
      const data = await detailRes.json();
      setSessionData(data);
    } catch (err) {
      console.error('Failed to init host session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  // Connect Facilitator WebSocket for 1Hz live dashboard stream (§2)
  useEffect(() => {
    if (!sessionData?.session.id) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/lab/ws?role=facilitator&sessionId=${sessionData.session.id}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'dashboard' && msg.payload.teams) {
          setLiveTeams(msg.payload.teams);
        }
      } catch (err) {
        console.error('WS dashboard error:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [sessionData?.session.id]);

  const activeRun = sessionData?.runs.find(r => r.status === 'running' || r.status === 'paused') || sessionData?.runs[0];

  const handleStartRun = async () => {
    if (!activeRun) return;
    await fetch(`/lab/api/runs/${activeRun.id}/start`, { method: 'POST' });
    const res = await fetch(`/lab/api/sessions/${sessionData?.session.id}`);
    setSessionData(await res.json());
  };

  const handlePauseResume = async () => {
    if (!activeRun) return;
    const isPaused = activeRun.status === 'paused';
    const endpoint = isPaused ? 'resume' : 'pause';
    await fetch(`/lab/api/runs/${activeRun.id}/${endpoint}`, { method: 'POST' });
    const res = await fetch(`/lab/api/sessions/${sessionData?.session.id}`);
    setSessionData(await res.json());
  };

  const handleStopRun = async () => {
    if (!activeRun) return;
    await fetch(`/lab/api/runs/${activeRun.id}/stop`, { method: 'POST' });
    const res = await fetch(`/lab/api/sessions/${sessionData?.session.id}`);
    setSessionData(await res.json());
  };

  const handleForceAdvance = async (teamId: string) => {
    await fetch(`/lab/api/teams/${teamId}/advance`, { method: 'POST' });
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/j/${sessionData?.session.join_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateExperimentRun = async () => {
    if (!sessionData) return;
    await fetch(`/lab/api/sessions/${sessionData.session.id}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advancement: 'wait_all',
        label: newRunLabel
      })
    });
    const res = await fetch(`/lab/api/sessions/${sessionData.session.id}`);
    setSessionData(await res.json());
  };

  if (loading || !sessionData) {
    return (
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading Host Console...</span>
        </div>
      </div>
    );
  }

  const teamsToDisplay = liveTeams.length > 0 ? liveTeams : sessionData.teams.map(t => ({
    teamId: t.id,
    teamName: t.name,
    week: t.current_week,
    seatsHuman: t.seats.filter(s => s.holder_type === 'human').length,
    seatsBot: t.seats.filter(s => s.holder_type === 'bot').length,
    pendingSeats: 0,
    cumCostCents: 0,
    status: t.status
  }));

  return (
    <div className="min-h-full flex flex-col p-4 sm:p-8 max-w-6xl mx-auto w-full space-y-6">
      {/* ── Top Bar with Join Banner ── */}
      <div className="glass-panel rounded-3xl p-6 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl">
        <div>
          <span className="text-xs uppercase tracking-wider font-extrabold text-sky-400">Facilitator Console</span>
          <h1 className="text-2xl font-black text-white tracking-tight">{sessionData.session.title}</h1>
          <p className="text-xs text-slate-400 mt-1">
            Active: <span className="font-bold text-white">{activeRun?.label || 'None'}</span> · Mode: {activeRun?.round_seconds ? `${activeRun.round_seconds}s Timer` : 'Wait All Players'}
          </p>
        </div>

        {/* Join Code Card */}
        <div className="flex items-center space-x-3 bg-slate-900/90 border border-slate-700/80 p-3 rounded-2xl">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Participant Join Code</div>
            <div className="text-2xl font-black text-white tracking-widest font-mono">
              {sessionData.session.join_code}
            </div>
          </div>
          <button
            onClick={handleCopyLink}
            className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white transition active:scale-95 flex items-center space-x-1.5 text-xs font-bold"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied Link' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* ── Facilitator Control Toolbar ── */}
      <div className="glass-panel rounded-2xl p-4 border border-white/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          {activeRun?.status !== 'running' && activeRun?.status !== 'paused' ? (
            <button
              onClick={handleStartRun}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition active:scale-95"
            >
              <Play className="w-4 h-4" />
              <span>Start Simulation</span>
            </button>
          ) : (
            <>
              <button
                onClick={handlePauseResume}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition active:scale-95"
              >
                {activeRun?.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                <span>{activeRun?.status === 'paused' ? 'Resume All' : 'Pause All'}</span>
              </button>

              <button
                onClick={handleStopRun}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 font-bold text-xs transition active:scale-95"
              >
                <Square className="w-4 h-4" />
                <span>End Run Early</span>
              </button>
            </>
          )}

          {activeRun && (
            <a
              href={`/lab/r/${activeRun.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition"
            >
              <ExternalLink className="w-4 h-4 text-sky-400" />
              <span>Debrief View</span>
            </a>
          )}
        </div>

        {/* Phase 2: Create Second Run (Experiment) */}
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newRunLabel}
            onChange={e => setNewRunLabel(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 outline-none w-64"
          />
          <button
            onClick={handleCreateExperimentRun}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Run 2</span>
          </button>
        </div>
      </div>

      {/* ── Live Teams Grid ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Active Supply Chain Teams ({teamsToDisplay.length})
          </h2>
          <span className="text-xs text-slate-500 flex items-center space-x-1">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>1Hz Live Synchronization</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teamsToDisplay.map((team) => (
            <div
              key={team.teamId}
              className="glass-panel rounded-2xl p-5 border border-white/5 shadow-xl hover:border-white/10 transition space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-white">{team.teamName}</h3>
                  <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Users className="w-3.5 h-3.5 text-sky-400" />
                      <span>{team.seatsHuman} human</span>
                    </span>
                    <span>·</span>
                    <span className="flex items-center space-x-1">
                      <Bot className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{team.seatsBot} bots</span>
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Team Cost</div>
                  <div className="text-lg font-black text-amber-400">
                    ${(team.cumCostCents / 100).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Week {team.week} of 36</span>
                  <span>{Math.round((team.week / 36) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, (team.week / 36) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Team Action Bar */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                <div className="text-xs">
                  {team.pendingSeats > 0 ? (
                    <span className="text-amber-400 font-semibold">
                      Waiting on {team.pendingSeats} player(s)
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-semibold">
                      All orders received
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleForceAdvance(team.teamId)}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  <FastForward className="w-3.5 h-3.5 text-sky-400" />
                  <span>Force Advance</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
