import React from 'react';
import { Play } from 'lucide-react';

interface HowToPlayViewProps {
  onStartPlay: () => void;
}

export const HowToPlayView: React.FC<HowToPlayViewProps> = ({ onStartPlay }) => {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 md:p-8">
        <h1 className="text-2xl font-bold text-slate-900">How TUGofWAR Works</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          TUGofWAR turns addition facts 1–20 into an energetic Tug-of-War formative assessment. Every correct answer pulls the center knot toward your goal line, while behind the scenes the game logs response speed and mental-math strategy accuracy.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-bold text-slate-900">01. Solo vs. Coach Bot</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Ideal for individual student practice. Choose your addition tier (Sums to 10, Bridging 10, or Full 1–20 Mix) and a bot pace. Use the <strong>Ten-Frame Hint</strong> whenever you want to see how to make 10.
            </p>
            <p className="mt-3 text-xs font-medium text-slate-500">
              Keyboard shortcuts: Press <span className="font-mono font-semibold text-slate-800">1</span>, <span className="font-mono font-semibold text-slate-800">2</span>, <span className="font-mono font-semibold text-slate-800">3</span>, or <span className="font-mono font-semibold text-slate-800">4</span> to pick answers fast.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-bold text-slate-900">02. 2-Player Classroom Duel</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Designed for two students sharing a tablet, laptop, or classroom whiteboard. Both teams race simultaneously on addition 1–20 questions to pull the rope across their win line first.
            </p>
            <p className="mt-3 text-xs font-medium text-slate-500">
              Team Blue keys: <span className="font-mono font-semibold text-slate-800">1–4</span> · Team Coral keys: <span className="font-mono font-semibold text-slate-800">7–0</span> (or tap directly).
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-6">
          <h2 className="text-base font-bold text-slate-900">03. Formative Assessment Insights</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            After each match, inspect the <strong>Assessment Report</strong> to see mastery across four core addition strategies: <em>Sums to 10</em>, <em>Doubles &amp; Near-Doubles</em>, <em>Bridging Through 10</em>, and <em>Adding with 10 &amp; Teens</em>. Teachers can export results to CSV or launch a targeted rematch using only missed facts.
          </p>
        </div>

        <div className="mt-6">
          <button
            onClick={onStartPlay}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Play className="h-4 w-4" />
            Go to Play Arena
          </button>
        </div>
      </div>
    </div>
  );
};
