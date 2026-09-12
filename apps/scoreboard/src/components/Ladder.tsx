import type { LevelResult } from "@shared/schema/run";

const LEVELS = [1, 2, 3, 4, 5, 6];

export default function Ladder({ levels }: { levels: LevelResult[] }) {
  return (
    <ol className="ladder">
      {LEVELS.map((level) => {
        const result = levels.find((l) => l.level === level);
        const status = !result ? "pending" : result.outcome === "completed" ? "pass" : "fail";
        return (
          <li key={level} className={`rung rung-${status}`}>
            <span>Level {level}</span>
            {result && <span className="failure-mode">{result.failure_mode ?? result.outcome}</span>}
          </li>
        );
      })}
    </ol>
  );
}
