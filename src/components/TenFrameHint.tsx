import React from 'react';
import { getStrategyTip } from '../utils/mathEngine';

interface TenFrameHintProps {
  a: number;
  b: number;
}

export const TenFrameHint: React.FC<TenFrameHintProps> = ({ a, b }) => {
  const total = a + b;
  const cells = Array.from({ length: 20 }, (_, i) => {
    if (i < a) return 'A';
    if (i < total) return 'B';
    return 'EMPTY';
  });

  const renderFrame = (startIdx: number, label: string) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="grid grid-cols-5 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
        {cells.slice(startIdx, startIdx + 10).map((type, idx) => (
          <div
            key={idx}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white"
          >
            {type === 'A' && (
              <span className="h-4 w-4 rounded-full bg-blue-600" aria-label="First addend counter" />
            )}
            {type === 'B' && (
              <span className="h-4 w-4 rounded-full bg-amber-500" aria-label="Second addend counter" />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-blue-600" />
            <span className="font-mono font-semibold tabular-nums">{a}</span>
          </span>
          <span className="text-slate-400">+</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
            <span className="font-mono font-semibold tabular-nums">{b}</span>
          </span>
        </div>
        <span className="text-xs font-medium text-slate-500">Visual Ten-Frame Strategy</span>
      </div>

      {total <= 20 && (
        <div className="flex flex-wrap items-center gap-4">
          {renderFrame(0, 'First Ten (1–10)')}
          {total > 10 && renderFrame(10, 'Second Ten (11–20)')}
        </div>
      )}

      <p className="mt-3 text-sm text-slate-700">{getStrategyTip(a, b)}</p>
    </div>
  );
};
