import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Building2, User } from 'lucide-react';

interface Props {
  initialJoinCode?: string;
  onJoined: (data: { playerToken: string; seatId: string; teamId: string; runId: string; echelon: number }) => void;
}

export const JoinScreen: React.FC<Props> = ({ initialJoinCode, onJoined }) => {
  const [joinCode, setJoinCode] = useState(initialJoinCode || '');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCode(initialJoinCode.toUpperCase());
    }
  }, [initialJoinCode]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || !displayName.trim()) {
      setError('Please provide both a join code and your name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/lab/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          joinCode: joinCode.trim().toUpperCase(),
          displayName: displayName.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to join session');
      }

      // Store token in localStorage
      localStorage.setItem('qumni_player_token', data.playerToken);
      onJoined(data);
    } catch (err: any) {
      setError(err.message || 'Error joining game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-panel rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-center space-x-2 text-sky-400 font-semibold text-xs uppercase tracking-wider mb-2">
            <Sparkles className="w-4 h-4" />
            <span>MIT Beer Distribution Game</span>
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight">
            Join Supply Chain
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Experience the dynamics of systemic lag, bullwhip amplification, and coordination.
          </p>

          <form onSubmit={handleJoin} className="mt-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Join Code
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCD"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-700/60 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-lg font-black tracking-widest text-center text-white placeholder-slate-600 outline-none uppercase transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Your Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  maxLength={40}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-700/60 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm font-semibold text-white placeholder-slate-600 outline-none transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.98] text-white font-bold text-sm shadow-xl shadow-sky-500/25 flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              <span>{loading ? 'Entering...' : 'Enter Position'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
