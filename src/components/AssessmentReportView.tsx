import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  CircleDashed,
  Download,
  RotateCcw,
  Play,
  FileDown,
  Award,
  TrendingUp,
} from 'lucide-react';
import { MatchSession, MathStrategy } from '../types/assessment';
import {
  STRATEGY_LABELS,
  TIER_LABELS,
  exportAttemptsCsv,
  extractMissedPairs,
  getMasteryStatus,
  getStrategyTip,
  summarizeAttempts,
} from '../utils/mathEngine';
import {
  buildReportCardSummary,
  downloadAssessmentPdf,
  resolveSessionFolderName,
} from '../utils/pdfReport';

interface AssessmentReportViewProps {
  sessions: MatchSession[];
  onPracticeMissed: () => void;
  onClearHistory: () => void;
  onStartPlay: () => void;
}

const STRATEGIES: MathStrategy[] = [
  'SUMS_TO_10',
  'DOUBLES',
  'BRIDGING_10',
  'ADD_TEN_TEENS',
];

export const AssessmentReportView: React.FC<AssessmentReportViewProps> = ({
  sessions,
  onPracticeMissed,
  onClearHistory,
  onStartPlay,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions[0]?.id ?? 'ALL'
  );

  // Keep selectedSessionId valid if sessions list changes
  useEffect(() => {
    if (sessions.length === 0) return;
    if (selectedSessionId !== 'ALL' && !sessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [selectedSessionId, sessions]);

  const scopedSessions = useMemo(() => {
    if (selectedSessionId === 'ALL') return sessions;
    const match = sessions.find((s) => s.id === selectedSessionId);
    return match ? [match] : sessions;
  }, [selectedSessionId, sessions]);

  const reportCardSummary = useMemo(
    () => buildReportCardSummary(scopedSessions),
    [scopedSessions]
  );

  const [reportDescription, setReportDescription] = useState<string>(
    reportCardSummary.defaultDescription
  );
  const [reportTopics, setReportTopics] = useState<string>(
    reportCardSummary.defaultTopics
  );
  const [reportCompetency, setReportCompetency] = useState<string>(
    reportCardSummary.defaultCompetencyTarget
  );

  useEffect(() => {
    setReportDescription(reportCardSummary.defaultDescription);
    setReportTopics(reportCardSummary.defaultTopics);
    setReportCompetency(reportCardSummary.defaultCompetencyTarget);
  }, [
    reportCardSummary.defaultCompetencyTarget,
    reportCardSummary.defaultDescription,
    reportCardSummary.defaultTopics,
  ]);

  const handleDownloadPdf = () => {
    downloadAssessmentPdf({
      summary: reportCardSummary,
      description: reportDescription,
      topics: reportTopics,
      competencyTarget: reportCompetency,
    });
  };

  const studentAttempts = sessions.flatMap((s) =>
    s.attempts.filter((a) => a.player === 'BLUE')
  );
  const summary = summarizeAttempts(studentAttempts);
  const missedPairs = extractMissedPairs(sessions);
  const wins = sessions.filter((s) => s.winner === 'BLUE').length;

  const strategyStats = STRATEGIES.map((strategy) => {
    const filtered = studentAttempts.filter((a) => a.strategy === strategy);
    const stats = summarizeAttempts(filtered);
    const status = getMasteryStatus(stats.accuracy, stats.total);
    return { strategy, label: STRATEGY_LABELS[strategy], ...stats, status };
  });

  if (sessions.length === 0) {
    return (
      <section className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-10 text-center">
        <h2 className="text-2xl font-bold text-slate-900">No Assessment Data Yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Complete a Tug-of-War match to generate your addition 1–20 formative assessment breakdown, strategy mastery levels, and missed-fact review.
        </p>
        <div className="mt-6">
          <button
            onClick={onStartPlay}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Play className="h-4 w-4" />
            Start First Match
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Formative Assessment Report</h1>
          <p className="mt-1 text-sm text-slate-600">
            Student diagnostic summary across {sessions.length} {sessions.length === 1 ? 'match' : 'matches'} · Addition facts 1 to 20
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <FileDown className="h-4 w-4" />
            Download PDF Result
          </button>
          {missedPairs.length > 0 && (
            <button
              onClick={onPracticeMissed}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4" />
              Practice Missed Facts
            </button>
          )}
          <button
            onClick={() => exportAttemptsCsv(sessions)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-rose-200 hover:text-rose-700 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Data
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5">
              <span className="text-xs font-medium text-rose-800">Clear all history?</span>
              <button
                onClick={() => {
                  onClearHistory();
                  setConfirmClear(false);
                }}
                className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 whitespace-nowrap"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Overall Accuracy</div>
          <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {summary.accuracy}%
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.correct} of {summary.total} facts correct
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Avg Response Speed</div>
          <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {(summary.avgTimeMs / 1000).toFixed(1)}s
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Target fluency: under 3.0s
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Matches Won</div>
          <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {wins}/{sessions.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Team Blue record
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Facts Needing Review</div>
          <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {missedPairs.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {missedPairs.length === 0 ? 'All attempted facts clear' : 'Targeted practice ready'}
          </div>
        </div>
      </div>

      {/* Report Card & PDF Builder */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Report Card Folder Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-5 text-white">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-100">
              Match Report Card
            </div>
            <h2 className="mt-0.5 text-xl font-bold sm:text-2xl">
              {reportCardSummary.headerTitle}
            </h2>
            <p className="mt-1 text-xs text-blue-100 tabular-nums">
              {reportCardSummary.matchCount}{' '}
              {reportCardSummary.matchCount === 1 ? 'match' : 'matches'} ·{' '}
              {reportCardSummary.totalQuestionsPlayed} questions played ·{' '}
              {reportCardSummary.overallAccuracy}% overall accuracy
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Select match or folder for report card"
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="rounded-lg border border-white/25 bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur-xs focus:outline-none"
            >
              {sessions.map((s, idx) => (
                <option key={s.id} value={s.id} className="text-slate-900">
                  {idx === 0 ? 'Latest: ' : ''}
                  {resolveSessionFolderName(s)} ({new Date(s.startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })})
                </option>
              ))}
              {sessions.length > 1 && (
                <option value="ALL" className="text-slate-900">
                  All Matches Combined ({sessions.length})
                </option>
              )}
            </select>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-bold text-blue-800 shadow-xs transition-colors hover:bg-blue-50 whitespace-nowrap"
            >
              <FileDown className="h-4 w-4" />
              Download PDF
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Game Description, Topics & Competency Target (Editable before PDF Download) */}
          <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="report-desc-input"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600"
              >
                Game Description
              </label>
              <textarea
                id="report-desc-input"
                rows={3}
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="report-topics-input"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600"
              >
                Game Topics Covered
              </label>
              <textarea
                id="report-topics-input"
                rows={3}
                value={reportTopics}
                onChange={(e) => setReportTopics(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="report-competency-input"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600"
              >
                Competency Target / Test
              </label>
              <textarea
                id="report-competency-input"
                rows={3}
                value={reportCompetency}
                onChange={(e) => setReportCompetency(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Excellent Players vs Need Improving Players Overview */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-800">
                <Award className="h-4 w-4 text-emerald-600" />
                <span>Excellent Players (&ge; 80% Accuracy)</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reportCardSummary.excellentPlayers.length > 0 ? (
                  reportCardSummary.excellentPlayers.map((p) => (
                    <span
                      key={p.key}
                      className="rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 tabular-nums"
                    >
                      {p.playerName} · {p.accuracy}% ({p.correct}/{p.total})
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-emerald-800/80">
                    No players at &ge; 80% in this selection yet.
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-rose-800">
                <TrendingUp className="h-4 w-4 text-rose-600" />
                <span>Need Improving (&lt; 80% Accuracy)</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reportCardSummary.needsImprovingPlayers.length > 0 ? (
                  reportCardSummary.needsImprovingPlayers.map((p) => (
                    <span
                      key={p.key}
                      className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-900 tabular-nums"
                    >
                      {p.playerName} · {p.accuracy}% ({p.correct}/{p.total})
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-rose-800/80">
                    All players scored &ge; 80% in this selection!
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Individual Player Report Cards */}
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Individual Player Report Cards ({reportCardSummary.playerCards.length})
            </h3>
            {reportCardSummary.playerCards.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                No player question attempts recorded in this match selection.
              </p>
            ) : (
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {reportCardSummary.playerCards.map((card) => (
                  <div
                    key={card.key}
                    className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="text-base font-bold text-slate-900">
                          {card.playerName}
                        </div>
                        <div className="text-xs text-slate-500 tabular-nums">
                          {card.teamName} · {card.correct}/{card.total} correct ·{' '}
                          {(card.avgTimeMs / 1000).toFixed(1)}s avg
                        </div>
                      </div>
                      <span
                        className={`rounded-md px-2.5 py-1 text-xs font-bold tabular-nums ${
                          card.rating === 'Excellent'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : card.rating === 'Developing'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {card.rating} ({card.accuracy}%)
                      </span>
                    </div>

                    {/* Excellent Ones */}
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                        Excellent Ones ({card.excellentItems.length})
                      </div>
                      {card.excellentItems.length > 0 ? (
                        <ul className="mt-1 space-y-1 text-xs text-slate-700">
                          {card.excellentItems.map((item) => (
                            <li
                              key={`ex-${item.id}`}
                              className="flex items-center justify-between gap-2 rounded bg-emerald-50/50 px-2 py-1"
                            >
                              <span className="truncate font-medium text-slate-900">
                                {item.questionText}
                              </span>
                              <span className="shrink-0 font-mono text-[11px] text-emerald-700 tabular-nums">
                                {item.correctText} · {(item.responseTimeMs / 1000).toFixed(1)}s
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400">None yet</p>
                      )}
                    </div>

                    {/* Need Improving Ones */}
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
                        Need Improving Ones ({card.needsImprovingItems.length})
                      </div>
                      {card.needsImprovingItems.length > 0 ? (
                        <ul className="mt-1 space-y-1 text-xs text-slate-700">
                          {card.needsImprovingItems.map((item) => (
                            <li
                              key={`im-${item.id}`}
                              className="flex items-center justify-between gap-2 rounded bg-rose-50/50 px-2 py-1"
                            >
                              <span className="truncate font-medium text-slate-900">
                                {item.questionText}
                              </span>
                              <span className="shrink-0 font-mono text-[11px] text-rose-700 tabular-nums">
                                Picked {item.chosenText} (Ans: {item.correctText})
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-emerald-700">
                          None — all played questions answered accurately!
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Strategy Mastery Breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Addition Strategy Mastery (1–20)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Performance grouped by mental-math strategy to guide targeted instruction.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {strategyStats.map((item) => {
            const barColor =
              item.status.tone === 'emerald'
                ? 'bg-emerald-600'
                : item.status.tone === 'amber'
                ? 'bg-amber-500'
                : item.status.tone === 'rose'
                ? 'bg-rose-600'
                : 'bg-slate-300';

            const statusColor =
              item.status.tone === 'emerald'
                ? 'text-emerald-700'
                : item.status.tone === 'amber'
                ? 'text-amber-700'
                : item.status.tone === 'rose'
                ? 'text-rose-700'
                : 'text-slate-500';

            return (
              <div key={item.strategy} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{item.label}</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusColor}`}>
                    {item.status.tone === 'emerald' && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {item.status.tone === 'amber' && <AlertTriangle className="h-3.5 w-3.5" />}
                    {item.status.tone === 'rose' && <AlertTriangle className="h-3.5 w-3.5" />}
                    {item.status.tone === 'slate' && <CircleDashed className="h-3.5 w-3.5" />}
                    {item.status.label}
                  </span>
                </div>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${item.total > 0 ? item.accuracy : 0}%` }}
                  />
                </div>

                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600 tabular-nums">
                  <span>
                    Accuracy: <strong className="font-mono text-slate-900">{item.total > 0 ? `${item.accuracy}%` : '—'}</strong> ({item.correct}/{item.total})
                  </span>
                  <span>
                    Avg Speed: <strong className="font-mono text-slate-900">{item.total > 0 ? `${(item.avgTimeMs / 1000).toFixed(1)}s` : '—'}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tricky Facts & Recent Matches Split */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tricky Facts Review */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-900">Facts Needing Practice</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {missedPairs.length} {missedPairs.length === 1 ? 'fact' : 'facts'}
            </span>
          </div>

          {missedPairs.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              No missed facts recorded yet. Great accuracy across all tested additions!
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {missedPairs.slice(0, 8).map((pair) => (
                <div key={`${pair.a}+${pair.b}`} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-base font-bold tabular-nums text-slate-900">
                      {pair.a} + {pair.b} = {pair.a + pair.b}
                    </span>
                    <span className="text-xs font-medium text-rose-700 tabular-nums">
                      Missed {Math.ceil(pair.misses)}×
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {getStrategyTip(pair.a, pair.b)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Matches Log */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">Recent Match Log</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="pb-2 pr-3">Tier</th>
                  <th className="pb-2 pr-3">Outcome</th>
                  <th className="pb-2 pr-3 text-right">Score</th>
                  <th className="pb-2 text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.slice(0, 8).map((s) => {
                  const blueAtt = s.attempts.filter((a) => a.player === 'BLUE');
                  const sum = summarizeAttempts(blueAtt);
                  return (
                    <tr key={s.id} className="text-slate-700">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-900">
                          {s.customGroupLabel ?? TIER_LABELS[s.tier]}
                        </div>
                        <div className="text-xs text-slate-500">
                          {s.mode === 'SOLO_BOT' ? `vs Bot (${s.botDifficulty?.toLowerCase()})` : '2-Player Duel'}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={
                            s.winner === 'BLUE'
                              ? 'font-semibold text-emerald-700'
                              : 'font-semibold text-rose-700'
                          }
                        >
                          {s.winner === 'BLUE' ? 'Blue Won' : 'Coral Won'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                        {s.bluePulls}–{s.coralPulls}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {sum.accuracy}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
