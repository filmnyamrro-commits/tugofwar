import React from 'react';

interface TugArenaSvgProps {
  /** Rope position from -maxSteps (Blue wins) to +maxSteps (Coral wins) */
  ropePosition: number;
  maxSteps: number;
  lastPuller: 'BLUE' | 'CORAL' | null;
  lastEventText: string | null;
  blueLabel: string;
  coralLabel: string;
  bluePlayers?: string[];
  coralPlayers?: string[];
  activeBlueIndex?: number;
  activeCoralIndex?: number;
  backgroundImageUrl?: string | null;
}

const SKIN_TONES = ['#FDBA74', '#FDE68A', '#FED7AA', '#E5B887', '#FCD34D', '#D9A066'];

function truncateName(name: string, maxLen = 10): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Player';
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

function getTeamSpacing(count: number): number {
  if (count <= 3) return 62;
  if (count === 4) return 54;
  if (count <= 6) return 46;
  if (count === 7) return 42;
  if (count === 8) return 38;
  if (count === 9) return 35;
  return 32;
}

function getBluePositions(count: number): number[] {
  const safeCount = Math.max(1, Math.min(10, count));
  const anchorRight = safeCount >= 7 ? 415 : 405;
  const spacing = getTeamSpacing(safeCount);
  return Array.from({ length: safeCount }, (_, i) => anchorRight - (safeCount - 1 - i) * spacing);
}

function getCoralPositions(count: number): number[] {
  const safeCount = Math.max(1, Math.min(10, count));
  const anchorLeft = safeCount >= 7 ? 545 : 555;
  const spacing = getTeamSpacing(safeCount);
  return Array.from({ length: safeCount }, (_, i) => anchorLeft + i * spacing);
}

export const TugArenaSvg: React.FC<TugArenaSvgProps> = ({
  ropePosition,
  maxSteps,
  lastPuller,
  lastEventText,
  blueLabel,
  coralLabel,
  bluePlayers = ['Player 1', 'Player 2', 'Player 3'],
  coralPlayers = ['Bot 1', 'Bot 2', 'Bot 3'],
  activeBlueIndex,
  activeCoralIndex,
  backgroundImageUrl,
}) => {
  const clamped = Math.max(-maxSteps, Math.min(maxSteps, ropePosition));
  const stepPx = 192 / maxSteps;
  const shiftX = clamped * stepPx;

  const blueLean = lastPuller === 'BLUE' ? -16 : -9;
  const coralLean = lastPuller === 'CORAL' ? 16 : 9;

  const bluePositions = getBluePositions(bluePlayers.length);
  const coralPositions = getCoralPositions(coralPlayers.length);

  const ropeLeft = Math.min(200, (bluePositions[0] ?? 240) - 25);
  const ropeRight = Math.max(760, (coralPositions[coralPositions.length - 1] ?? 720) + 25);
  const ropeWidth = ropeRight - ropeLeft;
  const hasCustomBg = Boolean(backgroundImageUrl);

  return (
    <div className="w-full select-none">
      {/* Arena Status Header (non-hue-only, tabular numerals) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-xs font-medium text-slate-600 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" aria-hidden="true" />
          <span className="font-semibold text-slate-900">
            {blueLabel} ({bluePlayers.length})
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono tabular-nums text-slate-600">
            {clamped < 0
              ? `${Math.abs(clamped)}/${maxSteps} Ahead`
              : clamped === 0
              ? 'Center'
              : `${maxSteps + clamped} to Win`}
          </span>
        </div>

        <div className="text-center font-mono text-xs font-semibold tabular-nums text-slate-700">
          {lastEventText ? (
            <span
              className={
                lastPuller === 'BLUE'
                  ? 'text-blue-700'
                  : lastPuller === 'CORAL'
                  ? 'text-rose-700'
                  : 'text-slate-700'
              }
            >
              {lastEventText}
            </span>
          ) : (
            <span>Pull to {maxSteps} to Win</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono tabular-nums text-slate-600">
            {clamped > 0
              ? `${clamped}/${maxSteps} Ahead`
              : clamped === 0
              ? 'Center'
              : `${maxSteps - clamped} to Win`}
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-semibold text-slate-900">
            {coralLabel} ({coralPlayers.length})
          </span>
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-600" aria-hidden="true" />
        </div>
      </div>

      {/* Interactive SVG Field */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <svg
          viewBox="0 0 960 270"
          className="block h-auto w-full"
          role="img"
          aria-label={`Tug of war field. ${blueLabel} has ${bluePlayers.length} players vs ${coralLabel} with ${coralPlayers.length} players. Rope position is ${clamped} out of ${maxSteps}.`}
        >
          <defs>
            <linearGradient id="skyField" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#F1F5F9" />
            </linearGradient>
            <linearGradient id="turfGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E2F5EA" />
              <stop offset="100%" stopColor="#D1FAE5" />
            </linearGradient>
            <pattern id="ropePattern" width="14" height="10" patternUnits="userSpaceOnUse">
              <rect width="14" height="10" fill="#B45309" />
              <path d="M0,10 L7,0 L14,10" fill="none" stroke="#F59E0B" strokeWidth="2.5" opacity="0.7" />
              <path d="M-7,10 L0,0 L7,10" fill="none" stroke="#78350F" strokeWidth="2" opacity="0.6" />
            </pattern>
          </defs>

          {hasCustomBg && backgroundImageUrl ? (
            <>
              {/* Uploaded JPEG Photo auto-fitted to full arena dimensions */}
              <image
                href={backgroundImageUrl}
                x="0"
                y="0"
                width="960"
                height="270"
                preserveAspectRatio="xMidYMid slice"
              />
              {/* Subtle legibility scrims so players, rope, and lines stay crisp */}
              <rect x="0" y="0" width="960" height="195" fill="#0F172A" opacity="0.14" />
              <line x1="0" y1="195" x2="960" y2="195" stroke="#FFFFFF" strokeOpacity="0.65" strokeWidth="2" />
              <rect x="0" y="195" width="960" height="75" fill="#0F172A" opacity="0.28" />
            </>
          ) : (
            <>
              {/* Upper Sky Backdrop */}
              <rect x="0" y="0" width="960" height="195" fill="url(#skyField)" />
              <line x1="0" y1="195" x2="960" y2="195" stroke="#CBD5E1" strokeWidth="2" />

              {/* Grass Turf Field */}
              <rect x="0" y="195" width="960" height="75" fill="url(#turfGrad)" />
            </>
          )}

          {/* Left Victory Zone (Blue) */}
          <rect x="0" y="195" width="288" height="75" fill="#DBEAFE" opacity={hasCustomBg ? 0.34 : 0.6} />
          <line x1="288" y1="178" x2="288" y2="270" stroke="#2563EB" strokeWidth="3" strokeDasharray="6 4" />
          <line x1="288" y1="118" x2="288" y2="195" stroke="#1E40AF" strokeWidth="3" />
          <polygon points="288,120 252,132 288,144" fill="#2563EB" />
          {hasCustomBg && (
            <rect x="64" y="221" width="160" height="24" rx="6" fill="#FFFFFF" opacity="0.88" />
          )}
          <text x="144" y="238" textAnchor="middle" fill="#1E40AF" fontSize="13" fontWeight="700" fontFamily="Outfit, sans-serif">
            {truncateName(blueLabel.toUpperCase(), 14)} WIN LINE
          </text>

          {/* Right Victory Zone (Coral) */}
          <rect x="672" y="195" width="288" height="75" fill="#FFE4E6" opacity={hasCustomBg ? 0.34 : 0.6} />
          <line x1="672" y1="178" x2="672" y2="270" stroke="#E11D48" strokeWidth="3" strokeDasharray="6 4" />
          <line x1="672" y1="118" x2="672" y2="195" stroke="#9F1239" strokeWidth="3" />
          <polygon points="672,120 708,132 672,144" fill="#E11D48" />
          {hasCustomBg && (
            <rect x="736" y="221" width="160" height="24" rx="6" fill="#FFFFFF" opacity="0.88" />
          )}
          <text x="816" y="238" textAnchor="middle" fill="#9F1239" fontSize="13" fontWeight="700" fontFamily="Outfit, sans-serif">
            {truncateName(coralLabel.toUpperCase(), 14)} WIN LINE
          </text>

          {/* Center Pit / Chalk Line */}
          <line x1="480" y1="182" x2="480" y2="265" stroke="#FFFFFF" strokeWidth="4" />
          <circle cx="480" cy="222" r="14" fill="none" stroke={hasCustomBg ? '#FFFFFF' : '#94A3B8'} strokeWidth="1.5" strokeDasharray="3 3" />

          {/* Yardage Ticks */}
          {Array.from({ length: maxSteps * 2 - 1 }).map((_, idx) => {
            const stepOffset = idx - (maxSteps - 1);
            if (stepOffset === 0) return null;
            const x = 480 + stepOffset * stepPx;
            return <line key={idx} x1={x} y1="195" x2={x} y2="210" stroke="#94A3B8" strokeWidth="2" />;
          })}

          {/* Animated Rope + Teams Group */}
          <g
            style={{
              transform: `translateX(${shiftX}px)`,
              transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Main Hemp Rope */}
            <rect
              x={ropeLeft}
              y="158"
              width={ropeWidth}
              height="9"
              rx="4.5"
              fill="url(#ropePattern)"
              stroke="#78350F"
              strokeWidth="1.2"
            />

            {/* Center Knot + Hanging Flag */}
            <g transform="translate(480, 162)">
              <polygon points="-8,6 8,6 0,34" fill="#F59E0B" stroke="#B45309" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="9" fill="#D97706" stroke="#78350F" strokeWidth="2" />
              <circle cx="0" cy="0" r="3.5" fill="#FEF3C7" />
            </g>

            {/* TEAM BLUE (Dynamic Player Count & Names) */}
            {bluePositions.map((xPos, i) => {
              const isDense = bluePlayers.length >= 7;
              const playerName = truncateName(bluePlayers[i] || `P${i + 1}`, isDense ? 8 : 9);
              const isActive = activeBlueIndex === i;
              const nameY = isDense
                ? i % 3 === 0
                  ? -86
                  : i % 3 === 1
                  ? -104
                  : -122
                : bluePlayers.length >= 4 && i % 2 === 1
                ? -104
                : -88;
              const labelW = isDense ? 56 : 64;

              return (
                <g key={`blue-${i}`} transform={`translate(${xPos}, 195)`}>
                  <ellipse cx="0" cy="3" rx="17" ry="4" fill="#0F172A" opacity="0.12" />

                  {/* Player Name Label */}
                  <g transform={`translate(-6, ${nameY})`}>
                    <rect
                      x={-labelW / 2}
                      y="-13"
                      width={labelW}
                      height="16"
                      rx="4"
                      fill={isActive ? '#1D4ED8' : '#FFFFFF'}
                      stroke={isActive ? '#1E3A8A' : '#CBD5E1'}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="-2"
                      textAnchor="middle"
                      fill={isActive ? '#FFFFFF' : '#1E293B'}
                      fontSize={isDense ? '8.5' : '9.5'}
                      fontWeight="700"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {playerName}
                    </text>
                  </g>

                  <g
                    style={{
                      transform: `rotate(${blueLean}deg)`,
                      transformOrigin: '0px 0px',
                      transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    <line x1="-2" y1="-22" x2="-14" y2="2" stroke="#1E3A8A" strokeWidth="7" strokeLinecap="round" />
                    <line x1="4" y1="-22" x2="14" y2="2" stroke="#1D4ED8" strokeWidth="7" strokeLinecap="round" />
                    <rect
                      x="-11"
                      y="-54"
                      width="22"
                      height="34"
                      rx="8"
                      fill={isActive ? '#1D4ED8' : '#2563EB'}
                      stroke={isActive ? '#93C5FD' : 'none'}
                      strokeWidth="2"
                    />
                    <text x="0" y="-33" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="700" fontFamily="JetBrains Mono, monospace">
                      {i + 1}
                    </text>
                    <circle cx="0" cy="-67" r="11" fill={SKIN_TONES[i % SKIN_TONES.length]} stroke="#0F172A" strokeWidth="1.5" />
                    <rect x="-10.5" y="-73" width="21" height="4.5" rx="2" fill="#1D4ED8" />
                    <circle cx="4" cy="-66" r="1.6" fill="#0F172A" />
                    <path d="M 6 -45 L 22 -35 L 30 -33" fill="none" stroke="#FDBA74" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="30" cy="-33" r="3.5" fill="#FDE68A" stroke="#0F172A" strokeWidth="1" />
                  </g>
                </g>
              );
            })}

            {/* TEAM CORAL (Dynamic Player Count & Names) */}
            {coralPositions.map((xPos, i) => {
              const isDense = coralPlayers.length >= 7;
              const playerName = truncateName(coralPlayers[i] || `P${i + 1}`, isDense ? 8 : 9);
              const isActive = activeCoralIndex === i;
              const nameY = isDense
                ? i % 3 === 0
                  ? -86
                  : i % 3 === 1
                  ? -104
                  : -122
                : coralPlayers.length >= 4 && i % 2 === 1
                ? -104
                : -88;
              const labelW = isDense ? 56 : 64;

              return (
                <g key={`coral-${i}`} transform={`translate(${xPos}, 195)`}>
                  <ellipse cx="0" cy="3" rx="17" ry="4" fill="#0F172A" opacity="0.12" />

                  {/* Player Name Label */}
                  <g transform={`translate(6, ${nameY})`}>
                    <rect
                      x={-labelW / 2}
                      y="-13"
                      width={labelW}
                      height="16"
                      rx="4"
                      fill={isActive ? '#BE123C' : '#FFFFFF'}
                      stroke={isActive ? '#881337' : '#CBD5E1'}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="-2"
                      textAnchor="middle"
                      fill={isActive ? '#FFFFFF' : '#1E293B'}
                      fontSize={isDense ? '8.5' : '9.5'}
                      fontWeight="700"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {playerName}
                    </text>
                  </g>

                  <g
                    style={{
                      transform: `rotate(${coralLean}deg)`,
                      transformOrigin: '0px 0px',
                      transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    <line x1="2" y1="-22" x2="14" y2="2" stroke="#881337" strokeWidth="7" strokeLinecap="round" />
                    <line x1="-4" y1="-22" x2="-14" y2="2" stroke="#BE123C" strokeWidth="7" strokeLinecap="round" />
                    <rect
                      x="-11"
                      y="-54"
                      width="22"
                      height="34"
                      rx="8"
                      fill={isActive ? '#BE123C' : '#E11D48'}
                      stroke={isActive ? '#FDA4AF' : 'none'}
                      strokeWidth="2"
                    />
                    <text x="0" y="-33" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="700" fontFamily="JetBrains Mono, monospace">
                      {i + 1}
                    </text>
                    <circle cx="0" cy="-67" r="11" fill={SKIN_TONES[(i + 2) % SKIN_TONES.length]} stroke="#0F172A" strokeWidth="1.5" />
                    <rect x="-10.5" y="-73" width="21" height="4.5" rx="2" fill="#BE123C" />
                    <circle cx="-4" cy="-66" r="1.6" fill="#0F172A" />
                    <path d="M -6 -45 L -22 -35 L -30 -33" fill="none" stroke="#FDBA74" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="-30" cy="-33" r="3.5" fill="#FED7AA" stroke="#0F172A" strokeWidth="1" />
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};
