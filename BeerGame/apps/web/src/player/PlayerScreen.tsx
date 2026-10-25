import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  AlertTriangle,
  ArrowDown,
  Clock,
  Send,
  History,
  CheckCircle2,
  Truck,
  LogOut
} from 'lucide-react';
import { ReflectionModal, PromptConfig } from './ReflectionModal';

interface PlayerState {
  week: number;
  revealedEndWeek: number | null;
  inventory: number;
  backlog: number;
  incomingOrder: number;
  pipeline: number[];
  costCentsThisWeek: number;
  cumCostCents: number;
  history: Array<{
    week: number;
    inventory: number;
    backlog: number;
    incomingOrder: number;
    shipped: number;
    orderPlaced: number;
    weekCostCents: number;
    cumCostCents: number;
  }>;
  deadlineAt: string | null;
  awaitingOrder: boolean;
  role: string;
  teamName: string;
  endCustomerDemand?: number;
}

interface Props {
  playerToken: string;
  onLogout?: () => void;
}

export const PlayerScreen: React.FC<Props> = ({ playerToken, onLogout }) => {
  const [state, setState] = useState<PlayerState | null>(null);
  const [orderQty, setOrderQty] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activePrompt, setActivePrompt] = useState<PromptConfig | null>(null);
  const [hasPromptedBacklog, setHasPromptedBacklog] = useState(false);
  const [hasPromptedSpike, setHasPromptedSpike] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Poll fallback / initial fetch
  const fetchState = async () => {
    try {
      const res = await fetch('/lab/api/me/state', {
        headers: { Authorization: `Bearer ${playerToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setState(data);
        if (data.awaitingOrder) {
          setSubmitting(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch player state:', err);
    }
  };

  useEffect(() => {
    fetchState();

    // Setup WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/lab/ws?token=${encodeURIComponent(playerToken)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state') {
          setState(msg.payload);
          if (msg.payload.awaitingOrder) {
            setSubmitting(false);
          }
        } else if (msg.type === 'round_opened') {
          fetchState();
        } else if (msg.type === 'round_closed') {
          fetchState();
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    // Heartbeat every 15 seconds
    const heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 15000);

    return () => {
      clearInterval(heartbeatTimer);
      ws.close();
    };
  }, [playerToken]);

  // Round countdown timer
  useEffect(() => {
    if (!state?.deadlineAt) {
      setSecondsRemaining(null);
      return;
    }

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((new Date(state.deadlineAt!).getTime() - Date.now()) / 1000));
      setSecondsRemaining(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [state?.deadlineAt]);

  // Check triggers for reflections / predictions (§6)
  useEffect(() => {
    if (!state) return;

    // Trigger: First backlog
    if (state.backlog > 0 && !hasPromptedBacklog) {
      setHasPromptedBacklog(true);
      setActivePrompt({
        promptId: 'first_backlog',
        kind: 'belief',
        title: 'Unexpected Backlog',
        question: `Your stage is currently in backlog (${state.backlog} units unfulfilled). What do you think caused this shortfall?`
      });
    }

    // Trigger: First large order (>= 2x incoming demand)
    if (orderQty >= 2 * state.incomingOrder && state.incomingOrder > 0 && !hasPromptedSpike) {
      setHasPromptedSpike(true);
      setActivePrompt({
        promptId: 'order_spike',
        kind: 'belief',
        title: 'Order Amplification',
        question: `You ordered ${orderQty} units while customer demand was ${state.incomingOrder}. Why this quantity, and what do you expect will happen next week?`
      });
    }
  }, [state?.backlog, state?.week]);

  const handleSubmitOrder = async (confirmed: boolean = false) => {
    if (!state || !state.awaitingOrder || submitting) return;

    if (orderQty > 50 && !confirmed) {
      setShowConfirmModal(true);
      return;
    }

    setSubmitting(true);
    setShowConfirmModal(false);

    const clientMsgId = 'msg-' + Math.random().toString(36).substring(2, 12);

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'submit_order',
          payload: {
            week: state.week,
            quantity: orderQty,
            clientMsgId
          }
        }));
      } else {
        // Fallback REST POST
        await fetch('/lab/api/me/order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${playerToken}`
          },
          body: JSON.stringify({
            week: state.week,
            quantity: orderQty,
            clientMsgId
          })
        });
      }
      fetchState();
    } catch (err) {
      console.error('Submit order failed:', err);
      setSubmitting(false);
    }
  };

  const handlePromptSubmit = async (resp: { statement: string; predictedDirection?: string }) => {
    if (!activePrompt) return;
    try {
      await fetch('/lab/api/me/utterance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${playerToken}`
        },
        body: JSON.stringify({
          promptId: activePrompt.promptId,
          kind: activePrompt.kind,
          body: resp.statement + (resp.predictedDirection ? ` [direction: ${resp.predictedDirection}]` : ''),
          week: state?.week
        })
      });
    } catch (err) {
      console.error('Failed to submit utterance:', err);
    } finally {
      setActivePrompt(null);
    }
  };

  if (!state) {
    return (
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading supply chain state...</span>
        </div>
      </div>
    );
  }

  const isBacklogged = state.backlog > 0;

  return (
    <div className="min-h-full flex flex-col max-w-lg mx-auto w-full px-4 py-3 sm:py-6 space-y-4">
      {/* ── Top Header ── */}
      <header className="glass-panel rounded-2xl p-4 flex items-center justify-between shadow-lg">
        <div>
          <span className="text-xs uppercase tracking-wider font-extrabold text-sky-400 flex items-center space-x-1">
            <span>{state.teamName}</span>
          </span>
          <h1 className="text-xl font-black text-white tracking-tight">{state.role}</h1>
        </div>

        <div className="flex items-center space-x-2">
          {secondsRemaining !== null && (
            <div className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center space-x-1 border ${
              secondsRemaining <= 10
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                : 'bg-slate-900 text-slate-300 border-slate-700'
            }`}>
              <Clock className="w-3.5 h-3.5" />
              <span>{secondsRemaining}s</span>
            </div>
          )}

          <div className="px-3 py-1 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-black">
            WEEK {state.week}
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              title="Leave Game"
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ── Cost Ticker ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-panel rounded-2xl p-3.5 border border-white/5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Week Cost</div>
          <div className="text-lg font-black text-white mt-0.5">
            ${(state.costCentsThisWeek / 100).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Hold $0.50 · Back $1.00
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-3.5 border border-white/5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Cost</div>
          <div className="text-lg font-black text-amber-400 mt-0.5">
            ${(state.cumCostCents / 100).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Cumulative to date</div>
        </div>
      </div>

      {/* ── Main Inventory & Backlog Status Cards ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Inventory Card */}
        <div className={`rounded-2xl p-4 border transition-all ${
          state.inventory > 0
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            : 'bg-slate-900/60 border-slate-800 text-slate-400'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">Inventory</span>
            <Package className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-white mt-1">{state.inventory}</div>
          <div className="text-[11px] text-emerald-400/80 mt-1">Units in stock</div>
        </div>

        {/* Backlog Card */}
        <div className={`rounded-2xl p-4 border transition-all ${
          isBacklogged
            ? 'bg-rose-950/50 border-rose-500/60 text-rose-200 pulse-glow'
            : 'bg-slate-900/60 border-slate-800 text-slate-400'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">Backlog</span>
            <AlertTriangle className={`w-4 h-4 ${isBacklogged ? 'text-rose-400' : 'text-slate-500'}`} />
          </div>
          <div className={`text-3xl font-black mt-1 ${isBacklogged ? 'text-rose-400' : 'text-white'}`}>
            {state.backlog}
          </div>
          <div className={`text-[11px] mt-1 ${isBacklogged ? 'text-rose-400 font-semibold' : 'text-slate-500'}`}>
            {isBacklogged ? 'Unfulfilled demand!' : 'No pending orders'}
          </div>
        </div>
      </div>

      {/* ── Incoming Demand Banner ── */}
      <div className="glass-panel rounded-2xl p-4 border-l-4 border-l-sky-500 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <ArrowDown className="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Incoming Order</div>
            <div className="text-xl font-black text-white">{state.incomingOrder} units</div>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300">
          From Customer
        </span>
      </div>

      {/* ── Shipping Pipeline (Supply Line) ── */}
      <div className="glass-panel rounded-2xl p-4 border border-white/5 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
          <div className="flex items-center space-x-1.5">
            <Truck className="w-4 h-4 text-sky-400" />
            <span>Shipping In Transit</span>
          </div>
          <span className="text-[11px] text-slate-500">Arrives in coming weeks</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {state.pipeline.map((units, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center animate-slide-in"
            >
              <div className="text-[10px] font-bold text-slate-400 uppercase">
                {idx === state.pipeline.length - 1 ? 'Arriving Next Week' : `Week +${state.pipeline.length - idx}`}
              </div>
              <div className="text-xl font-black text-sky-400 mt-0.5">{units}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Order Decision Input Area ── */}
      <div className="glass-panel rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Your Order for Supplier
          </span>
          <span className="text-xs text-slate-400">Step 5 · Place Orders</span>
        </div>

        {state.awaitingOrder && !submitting ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setOrderQty(Math.max(0, orderQty - 1))}
                className="w-12 h-12 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-xl font-bold text-white flex items-center justify-center transition"
              >
                -
              </button>

              <input
                type="number"
                min={0}
                max={9999}
                value={orderQty}
                onChange={e => setOrderQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="flex-1 h-12 rounded-2xl bg-slate-900/90 border border-slate-700 focus:border-sky-500 text-center text-2xl font-black text-white outline-none"
              />

              <button
                type="button"
                onClick={() => setOrderQty(orderQty + 1)}
                className="w-12 h-12 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-xl font-bold text-white flex items-center justify-center transition"
              >
                +
              </button>
            </div>

            {/* Quick Increment Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[0, 4, 8, 12].map(qty => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => setOrderQty(qty)}
                  className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                    orderQty === qty
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {qty} units
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleSubmitOrder(false)}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.98] text-white font-extrabold text-sm shadow-xl shadow-sky-500/25 flex items-center justify-center space-x-2 transition"
            >
              <Send className="w-4 h-4" />
              <span>Confirm & Send Order ({orderQty})</span>
            </button>
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center space-y-2 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-pulse" />
            <div className="text-sm font-bold text-white">Order Submitted for Week {state.week}</div>
            <p className="text-xs text-slate-400">Waiting for other echelons to advance...</p>
          </div>
        )}
      </div>

      {/* ── History Drawer Toggle ── */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full py-2.5 px-4 rounded-xl glass-panel border border-white/5 hover:border-white/10 text-xs font-bold text-slate-300 flex items-center justify-between transition"
      >
        <div className="flex items-center space-x-2">
          <History className="w-4 h-4 text-sky-400" />
          <span>Round History ({state.history.length} weeks played)</span>
        </div>
        <span className="text-slate-400 text-xs">{showHistory ? 'Hide' : 'View'}</span>
      </button>

      {/* ── History Table ── */}
      {showHistory && (
        <div className="glass-panel rounded-2xl p-4 border border-white/5 space-y-2 overflow-x-auto text-xs animate-slide-in">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                <th className="pb-2">Wk</th>
                <th className="pb-2">Demand</th>
                <th className="pb-2">Shipped</th>
                <th className="pb-2">Stock</th>
                <th className="pb-2">Backlog</th>
                <th className="pb-2">Ordered</th>
                <th className="pb-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {state.history.slice().reverse().map(h => (
                <tr key={h.week} className="font-mono">
                  <td className="py-1.5 font-bold text-sky-400">{h.week}</td>
                  <td className="py-1.5">{h.incomingOrder}</td>
                  <td className="py-1.5">{h.shipped}</td>
                  <td className="py-1.5 text-emerald-400">{h.inventory}</td>
                  <td className={`py-1.5 ${h.backlog > 0 ? 'text-rose-400 font-bold' : ''}`}>{h.backlog}</td>
                  <td className="py-1.5 font-bold text-white">{h.orderPlaced}</td>
                  <td className="py-1.5 text-right text-amber-400">${(h.weekCostCents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Order Warning Confirm Modal (> 50) ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-amber-500/30 text-slate-100 shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Large Order Quantity</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              You are ordering <span className="font-bold text-amber-400">{orderQty} units</span>. This is above the standard threshold. Large swings often amplify upstream instability (bullwhip effect). Confirm you wish to place this order?
            </p>
            <div className="flex items-center justify-end space-x-2 mt-5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:text-white"
              >
                Adjust
              </button>
              <button
                type="button"
                onClick={() => handleSubmitOrder(true)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950"
              >
                Yes, Submit {orderQty}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reflection Modal (§6) ── */}
      {activePrompt && (
        <ReflectionModal
          prompt={activePrompt}
          onSubmit={handlePromptSubmit}
          onSkip={() => setActivePrompt(null)}
        />
      )}
    </div>
  );
};
