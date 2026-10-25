import React, { useState } from 'react';
import { MessageSquare, ArrowRight, X } from 'lucide-react';

export interface PromptConfig {
  promptId: string;
  kind: 'belief' | 'reflection' | 'mental_model' | 'prediction';
  title: string;
  question: string;
  scope?: 'run' | 'experiment';
  hasDirection?: boolean;
}

interface Props {
  prompt: PromptConfig;
  onSubmit: (response: { statement: string; predictedDirection?: 'up' | 'down' | 'same' | 'unsure' }) => void;
  onSkip: () => void;
}

export const ReflectionModal: React.FC<Props> = ({ prompt, onSubmit, onSkip }) => {
  const [statement, setStatement] = useState('');
  const [direction, setDirection] = useState<'up' | 'down' | 'same' | 'unsure' | undefined>(undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!statement.trim() && !direction) {
      onSkip();
      return;
    }
    onSubmit({
      statement: statement.trim(),
      predictedDirection: direction
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-sky-500/20 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-sky-400">
                {prompt.kind.replace('_', ' ')}
              </span>
              <h3 className="text-base font-bold text-white">{prompt.title}</h3>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-sm font-medium text-slate-300 leading-relaxed">
            {prompt.question}
          </p>

          {prompt.hasDirection && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Expected Direction</label>
              <div className="grid grid-cols-4 gap-2">
                {(['up', 'down', 'same', 'unsure'] as const).map(dir => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setDirection(dir)}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border transition ${
                      direction === dir
                        ? 'bg-sky-500 text-white border-sky-400 shadow-lg shadow-sky-500/25'
                        : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {dir.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <textarea
              rows={3}
              value={statement}
              onChange={e => setStatement(e.target.value)}
              placeholder="Your reflection (optional, press Enter to submit)..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm text-slate-100 placeholder-slate-500 outline-none resize-none transition"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs font-medium text-slate-400 hover:text-slate-200 transition"
            >
              Skip for now
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-sky-500/20 transition active:scale-95"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
