import { jsPDF } from 'jspdf';
import { AttemptRecord, MatchSession } from '../types/assessment';
import { STRATEGY_LABELS, TIER_LABELS } from './mathEngine';

export interface QuestionPlayedItem {
  id: string;
  questionText: string;
  chosenText: string;
  correctText: string;
  isCorrect: boolean;
  usedHint: boolean;
  responseTimeMs: number;
  topicLabel: string;
}

export interface PlayerReportCard {
  key: string;
  playerName: string;
  teamName: string;
  teamSide: 'BLUE' | 'CORAL';
  total: number;
  correct: number;
  accuracy: number;
  avgTimeMs: number;
  rating: 'Excellent' | 'Developing' | 'Needs Improving';
  questionsPlayed: QuestionPlayedItem[];
  excellentItems: QuestionPlayedItem[];
  needsImprovingItems: QuestionPlayedItem[];
}

export interface AssessmentReportCardSummary {
  folderName: string;
  headerTitle: string;
  matchCount: number;
  totalQuestionsPlayed: number;
  overallAccuracy: number;
  defaultDescription: string;
  defaultTopics: string;
  defaultCompetencyTarget: string;
  playerCards: PlayerReportCard[];
  excellentPlayers: PlayerReportCard[];
  needsImprovingPlayers: PlayerReportCard[];
}

export function resolveSessionFolderName(session: MatchSession): string {
  if (session.questionFolderName && session.questionFolderName.trim()) {
    return session.questionFolderName.trim();
  }
  if (session.customGroupLabel && session.customGroupLabel.trim()) {
    return session.customGroupLabel
      .replace(/^(?:Folder|Topic)\s*:\s*/i, '')
      .replace(/\s*\(\d+\)\s*$/, '')
      .trim();
  }
  return TIER_LABELS[session.tier];
}

function formatQuestionText(att: AttemptRecord): string {
  if (att.prompt && att.prompt.trim()) {
    return att.prompt.trim();
  }
  return `${att.a} + ${att.b} = ?`;
}

function getPlayerRating(
  accuracy: number,
  total: number
): 'Excellent' | 'Developing' | 'Needs Improving' {
  if (total === 0) return 'Developing';
  if (accuracy >= 80) return 'Excellent';
  if (accuracy >= 60) return 'Developing';
  return 'Needs Improving';
}

export function buildReportCardSummary(
  sessions: MatchSession[]
): AssessmentReportCardSummary {
  const folderNames = Array.from(
    new Set(sessions.map((s) => resolveSessionFolderName(s)).filter(Boolean))
  );
  const folderName =
    folderNames.length === 1
      ? folderNames[0]
      : folderNames.length > 1
      ? `${folderNames[0]} (+${folderNames.length - 1} more)`
      : 'Addition 1–20';

  const headerTitle = `Assessment Report of ${folderName}`;

  const allAttempts: Array<{ att: AttemptRecord; session: MatchSession }> = [];
  for (const session of sessions) {
    for (const att of session.attempts) {
      allAttempts.push({ att, session });
    }
  }

  const topicSet = new Set<string>();
  for (const { att } of allAttempts) {
    if (att.groupLabel) {
      topicSet.add(att.groupLabel.replace(/^(?:Folder|Topic)\s*:\s*/i, '').trim());
    } else {
      topicSet.add(STRATEGY_LABELS[att.strategy]);
    }
  }
  const topicsList =
    topicSet.size > 0
      ? Array.from(topicSet).join(', ')
      : folderName;

  const hasCustomQuestions = allAttempts.some(({ att }) => Boolean(att.isCustom));
  const defaultDescription = hasCustomQuestions
    ? `Formative Tug-of-War team assessment measuring student accuracy and recall speed across questions from the "${folderName}" question folder.`
    : `Interactive TUGofWAR formative assessment evaluating addition fluency (1–20), mental math strategy use, and response speed on ${folderName}.`;

  const defaultCompetencyTarget = hasCustomQuestions
    ? `Demonstrate >= 80% accuracy and confident recall on "${folderName}" (${topicsList}) under timed team play.`
    : `Fluently solve addition facts within 20 using mental strategies (${topicsList}) with >= 80% accuracy and steady recall speed.`;

  const playerMap = new Map<
    string,
    {
      playerName: string;
      teamName: string;
      teamSide: 'BLUE' | 'CORAL';
      items: QuestionPlayedItem[];
    }
  >();

  for (const { att, session } of allAttempts) {
    const rawName = att.playerName?.trim() || (att.player === 'BLUE' ? 'Team Blue Player' : 'Team Coral Player');
    const teamName =
      att.player === 'BLUE'
        ? session.blueTeamName?.trim() || 'Team Blue'
        : session.coralTeamName?.trim() || 'Team Coral';
    const key = `${att.player}::${rawName.toLowerCase()}`;

    const entry = playerMap.get(key) ?? {
      playerName: rawName,
      teamName,
      teamSide: att.player,
      items: [],
    };

    entry.items.push({
      id: att.id,
      questionText: formatQuestionText(att),
      chosenText: String(att.chosenAnswerText ?? att.chosenAnswer),
      correctText: String(att.correctAnswerText ?? att.correctAnswer),
      isCorrect: att.isCorrect,
      usedHint: att.usedHint,
      responseTimeMs: att.responseTimeMs,
      topicLabel: att.groupLabel
        ? att.groupLabel.replace(/^(?:Folder|Topic)\s*:\s*/i, '').trim()
        : STRATEGY_LABELS[att.strategy],
    });

    playerMap.set(key, entry);
  }

  const playerCards: PlayerReportCard[] = Array.from(playerMap.entries()).map(
    ([key, entry]) => {
      const total = entry.items.length;
      const correct = entry.items.filter((i) => i.isCorrect).length;
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
      const avgTimeMs =
        total > 0
          ? Math.round(entry.items.reduce((sum, i) => sum + i.responseTimeMs, 0) / total)
          : 0;

      const excellentItems = entry.items.filter((i) => i.isCorrect && !i.usedHint);
      const needsImprovingItems = entry.items.filter((i) => !i.isCorrect || i.usedHint);

      return {
        key,
        playerName: entry.playerName,
        teamName: entry.teamName,
        teamSide: entry.teamSide,
        total,
        correct,
        accuracy,
        avgTimeMs,
        rating: getPlayerRating(accuracy, total),
        questionsPlayed: entry.items,
        excellentItems,
        needsImprovingItems,
      };
    }
  );

  // Sort Blue team first, then Coral, then higher accuracy
  playerCards.sort((a, b) => {
    if (a.teamSide !== b.teamSide) return a.teamSide === 'BLUE' ? -1 : 1;
    return b.accuracy - a.accuracy;
  });

  const totalQuestionsPlayed = allAttempts.length;
  const totalCorrect = allAttempts.filter(({ att }) => att.isCorrect).length;
  const overallAccuracy =
    totalQuestionsPlayed > 0 ? Math.round((totalCorrect / totalQuestionsPlayed) * 100) : 0;

  const excellentPlayers = playerCards.filter((p) => p.accuracy >= 80);
  const needsImprovingPlayers = playerCards.filter((p) => p.accuracy < 80);

  return {
    folderName,
    headerTitle,
    matchCount: sessions.length,
    totalQuestionsPlayed,
    overallAccuracy,
    defaultDescription,
    defaultTopics: topicsList,
    defaultCompetencyTarget,
    playerCards,
    excellentPlayers,
    needsImprovingPlayers,
  };
}

function sanitizePdfText(text: string): string {
  return text
    .replace(/→/g, '->')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E\n]/g, ' ');
}

export interface PdfDownloadOptions {
  summary: AssessmentReportCardSummary;
  description: string;
  topics: string;
  competencyTarget: string;
}

export function downloadAssessmentPdf({
  summary,
  description,
  topics,
  competencyTarget,
}: PdfDownloadOptions): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 16) {
      doc.addPage();
      y = 16;
    }
  };

  // Top Header Banner
  const headerLines = doc.splitTextToSize(
    sanitizePdfText(summary.headerTitle),
    contentWidth - 10
  );
  const bannerHeight = 16 + headerLines.length * 6.5;

  doc.setFillColor(29, 78, 216); // Blue-700
  doc.roundedRect(margin, y, contentWidth, bannerHeight, 2.5, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(headerLines, margin + 5, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  doc.text(
    sanitizePdfText(
      `Generated: ${dateStr}  |  Matches: ${summary.matchCount}  |  Questions Played: ${summary.totalQuestionsPlayed}  |  Overall Accuracy: ${summary.overallAccuracy}%`
    ),
    margin + 5,
    y + bannerHeight - 4.5
  );

  y += bannerHeight + 6;

  // Game Description, Topics & Competency Target Box
  const descLines = doc.splitTextToSize(
    sanitizePdfText(description.trim() || summary.defaultDescription),
    contentWidth - 10
  );
  const topicLines = doc.splitTextToSize(
    sanitizePdfText(topics.trim() || summary.defaultTopics),
    contentWidth - 10
  );
  const compLines = doc.splitTextToSize(
    sanitizePdfText(competencyTarget.trim() || summary.defaultCompetencyTarget),
    contentWidth - 10
  );

  const metaBoxHeight =
    18 + (descLines.length + topicLines.length + compLines.length) * 4.4;
  ensureSpace(metaBoxHeight);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, metaBoxHeight, 2, 2, 'FD');

  let innerY = y + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Game Description', margin + 5, innerY);
  innerY += 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(descLines, margin + 5, innerY);
  innerY += descLines.length * 4.4 + 2.5;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Topics Covered', margin + 5, innerY);
  innerY += 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(topicLines, margin + 5, innerY);
  innerY += topicLines.length * 4.4 + 2.5;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Competency Target / Test', margin + 5, innerY);
  innerY += 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(compLines, margin + 5, innerY);

  y += metaBoxHeight + 6;

  // Roster Summary: Excellent Players vs Need Improving Players
  const excellentNames =
    summary.excellentPlayers.length > 0
      ? summary.excellentPlayers.map((p) => `${p.playerName} (${p.accuracy}%)`).join(', ')
      : 'None in this match set yet';
  const improveNames =
    summary.needsImprovingPlayers.length > 0
      ? summary.needsImprovingPlayers.map((p) => `${p.playerName} (${p.accuracy}%)`).join(', ')
      : 'None - all players scored >= 80%';

  const exOverviewLines = doc.splitTextToSize(sanitizePdfText(excellentNames), contentWidth - 10);
  const imOverviewLines = doc.splitTextToSize(sanitizePdfText(improveNames), contentWidth - 10);
  const overviewHeight = 14 + (exOverviewLines.length + imOverviewLines.length) * 4.4;
  ensureSpace(overviewHeight);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, overviewHeight, 2, 2, 'FD');

  let ovY = y + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(4, 120, 87); // Emerald-700
  doc.text('Excellent Players (>= 80% accuracy):', margin + 5, ovY);
  ovY += 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(exOverviewLines, margin + 5, ovY);
  ovY += exOverviewLines.length * 4.4 + 2.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(190, 18, 60); // Rose-700
  doc.text('Players Needing Improvement (< 80% accuracy):', margin + 5, ovY);
  ovY += 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(imOverviewLines, margin + 5, ovY);

  y += overviewHeight + 7;

  // Individual Player Report Cards
  ensureSpace(12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Player Report Cards (Questions Played)', margin, y);
  y += 5;

  for (const card of summary.playerCards) {
    ensureSpace(38);

    // Card Title Strip
    const isExcellent = card.rating === 'Excellent';
    const isDeveloping = card.rating === 'Developing';

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      sanitizePdfText(`${card.playerName}  (${card.teamName})`),
      margin + 4,
      y + 5.2
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      sanitizePdfText(
        `Score: ${card.correct}/${card.total}  |  Accuracy: ${card.accuracy}%  |  Avg Speed: ${(
          card.avgTimeMs / 1000
        ).toFixed(1)}s`
      ),
      margin + 4,
      y + 9.8
    );

    // Rating Pill on right
    if (isExcellent) {
      doc.setTextColor(4, 120, 87);
    } else if (isDeveloping) {
      doc.setTextColor(180, 83, 9);
    } else {
      doc.setTextColor(190, 18, 60);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(card.rating.toUpperCase(), pageWidth - margin - 4, y + 7, { align: 'right' });

    y += 14.5;

    // Excellent Ones (Questions Answered Accurately)
    const exText =
      card.excellentItems.length > 0
        ? card.excellentItems
            .map((item) => `${item.questionText} [Ans: ${item.correctText}]`)
            .join('  ;  ')
        : 'None recorded yet';
    const exLines = doc.splitTextToSize(sanitizePdfText(exText), contentWidth - 8);
    ensureSpace(8 + exLines.length * 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(4, 120, 87);
    doc.text(`Excellent Ones (${card.excellentItems.length}):`, margin + 2, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(exLines, margin + 4, y);
    y += exLines.length * 4.2 + 2.5;

    // Need Improving Ones (Missed or Hint-Assisted Questions)
    const imText =
      card.needsImprovingItems.length > 0
        ? card.needsImprovingItems
            .map(
              (item) =>
                `${item.questionText} (Picked: ${item.chosenText}, Correct: ${item.correctText})`
            )
            .join('  ;  ')
        : 'None - all attempted questions answered accurately';
    const imLines = doc.splitTextToSize(sanitizePdfText(imText), contentWidth - 8);
    ensureSpace(8 + imLines.length * 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(190, 18, 60);
    doc.text(`Need Improving Ones (${card.needsImprovingItems.length}):`, margin + 2, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(imLines, margin + 4, y);
    y += imLines.length * 4.2 + 3;

    // Questions Played Table Header
    ensureSpace(12);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin + 2, y, contentWidth - 4, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(71, 85, 105);
    doc.text('#', margin + 4, y + 3.8);
    doc.text('Question Played', margin + 11, y + 3.8);
    doc.text('Picked', margin + 105, y + 3.8);
    doc.text('Correct', margin + 132, y + 3.8);
    doc.text('Result', margin + 159, y + 3.8);
    y += 6;

    card.questionsPlayed.forEach((qItem, idx) => {
      const qWrapped = doc.splitTextToSize(sanitizePdfText(qItem.questionText), 90);
      const rowH = Math.max(5.2, qWrapped.length * 3.8 + 1.4);
      ensureSpace(rowH + 1);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text(String(idx + 1), margin + 4, y + 3.5);
      doc.text(qWrapped, margin + 11, y + 3.5);
      doc.text(sanitizePdfText(qItem.chosenText).slice(0, 16), margin + 105, y + 3.5);
      doc.text(sanitizePdfText(qItem.correctText).slice(0, 16), margin + 132, y + 3.5);

      if (qItem.isCorrect) {
        doc.setTextColor(4, 120, 87);
        doc.text(
          `Pass (${(qItem.responseTimeMs / 1000).toFixed(1)}s)`,
          margin + 159,
          y + 3.5
        );
      } else {
        doc.setTextColor(190, 18, 60);
        doc.text(
          `Needs Review (${(qItem.responseTimeMs / 1000).toFixed(1)}s)`,
          margin + 159,
          y + 3.5
        );
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(margin + 2, y + rowH, pageWidth - margin - 2, y + rowH);
      y += rowH;
    });

    y += 7;
  }

  // Footer with page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `TUGofWAR Formative Assessment  |  Page ${p} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  const slug = summary.folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'match';
  const fileDate = new Date().toISOString().slice(0, 10);
  doc.save(`assessment-report-${slug}-${fileDate}.pdf`);
}
