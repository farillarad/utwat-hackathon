const LEVELS = [
  { level: 1, name: "Baseline" },
  { level: 2, name: "Distractors" },
  { level: 3, name: "Upsell Trap" },
  { level: 4, name: "DOM Instability" },
  { level: 5, name: "Silent Failure" },
  { level: 6, name: "Injection" },
];

// Purely presentational — a small "which rung of the ladder is this" indicator
// so a human watching the agent's live browser feed can follow along. Doesn't
// touch ground truth or scoring; safe to render on every level page.
export default function LevelProgress({ current }: { current: number }) {
  const label = LEVELS.find((l) => l.level === current)?.name ?? "";

  return (
    <div className="level-progress" aria-label={`Level ${current} of ${LEVELS.length}: ${label}`}>
      <ol className="level-progress-track">
        {LEVELS.map(({ level }) => (
          <li
            key={level}
            className={
              "level-dot" +
              (level === current ? " level-dot-current" : level < current ? " level-dot-done" : "")
            }
          >
            {level < current ? "✓" : level}
          </li>
        ))}
      </ol>
      <span className="level-progress-label">
        Level {current} · {label}
      </span>
    </div>
  );
}
