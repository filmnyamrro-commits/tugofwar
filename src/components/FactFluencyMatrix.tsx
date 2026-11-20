import React, { useState } from 'react';
import { MatchSession } from '../types/assessment';
import { getStrategyTip } from '../utils/mathEngine';

interface FactFluencyMatrixProps {
  sessions: MatchSession[];
}

export const FactFluencyMatrix: React.FC<FactFluencyMatrixProps> = ({ sessions }) => {
  const [selectedCell, setSelectedCell] = useState<{ a: number; b: number } | null>({ a: 8, b: 5 });

  // Build map of student attempts keyed by "a+b"
  const factStats = new Map<string, { attempts: number; correct: number; totalMs: number }>();

  for (const s of sessions) {
    for (const att of s.attempts) {
      if (att.player !== 'BLUE') continue;
      const key = `${att.a}+${att.b}`;
      const cur = factStats.get(key) ?? { attempts: 0, correct: 0, totalMs: 0 };
      cur.attempts += 1;
      if (att.isCorrect) cur.correct += 1;
      cur.totalMs += att.responseTimeMs;
      factStats.set(key, cur);
    }
  }

  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const selectedKey = selectedCell ? `${selectedCell.a}+${selectedCell.b}` : null;
  const selectedData = selectedKey ? factStats.get(selectedKey) : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Addition Fact Fluency Matrix (1–20)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Inspect student accuracy across core addition combinations up to 20. Select any cell to see its mental-math strategy.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Matrix Card */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center gap-5 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-slate-200 bg-slate-50" /> Not Tested
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" /> Fluent (85%+)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-100 border border-amber-300" /> Developing (60–84%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-rose-100 border border-rose-300" /> Needs Practice (&lt;60%)
            </span>
          </div>

          <table className="w-full border-collapse text-center font-mono text-xs tabular-nums">
            <thead>
              <tr>
                <th className="p-2 text-slate-400">+</th>
                {numbers.map((col) => (
                  <th key={col} className="p-2 font-bold text-slate-700">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {numbers.map((row) => (
                <tr key={row}>
                  <th className="p-2 font-bold text-slate-700">{row}</th>
                  {numbers.map((col) => {
                    const sum = row + col;
                    const stat = factStats.get(`${row}+${col}`);
                    const acc = stat ? Math.round((stat.correct / stat.attempts) * 100) : null;
                    const isSelected = selectedCell?.a === row && selectedCell?.b === col;

                    let cellClass = 'bg-slate-50 text-slate-500 hover:bg-slate-100';
                    if (acc !== null) {
                      if (acc >= 85) cellClass = 'bg-emerald-100 text-emerald-900 font-semibold';
                      else if (acc >= 60) cellClass = 'bg-amber-100 text-amber-900 font-semibold';
                      else cellClass = 'bg-rose-100 text-rose-900 font-semibold';
                    }

                    return (
                      <td key={col} className="p-1">
                        <button
                          onClick={() => setSelectedCell({ a: row, b: col })}
                          className={`flex h-9 w-full min-w-[36px] items-center justify-center rounded-md border transition-colors ${cellClass} ${
                            isSelected ? 'ring-2 ring-blue-600 border-blue-600' : 'border-slate-200/80'
                          }`}
                          title={`${row} + ${col} = ${sum}${acc !== null ? ` (${acc}% accuracy)` : ''}`}
                        >
                          {sum}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Selected Fact Inspector */}
        <aside className="rounded-xl border border-slate-200 bg-white p-6 h-fit">
          {selectedCell ? (
            <div>
              <div className="text-xs font-medium text-slate-500">Selected Fact</div>
              <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">
                {selectedCell.a} + {selectedCell.b} = {selectedCell.a + selectedCell.b}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="text-xs font-semibold text-slate-700">Mental-Math Strategy</div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {getStrategyTip(selectedCell.a, selectedCell.b)}
                </p>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="text-xs font-semibold text-slate-700">Student Record</div>
                {selectedData ? (
                  <dl className="mt-2 space-y-1.5 text-sm tabular-nums">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Attempts</dt>
                      <dd className="font-mono font-semibold text-slate-900">{selectedData.attempts}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Accuracy</dt>
                      <dd className="font-mono font-semibold text-slate-900">
                        {Math.round((selectedData.correct / selectedData.attempts) * 100)}%
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Avg Speed</dt>
                      <dd className="font-mono font-semibold text-slate-900">
                        {(selectedData.totalMs / selectedData.attempts / 1000).toFixed(1)}s
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-1.5 text-sm text-slate-500">
                    Not tested yet in a match.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select any square in the addition matrix to view strategy tips and student fluency.</p>
          )}
        </aside>
      </div>
    </div>
  );
};
