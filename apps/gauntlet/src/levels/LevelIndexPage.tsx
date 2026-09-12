import { Link } from "react-router-dom";
import { LEVELS } from "@shared/levels";
import Shell from "../components/Shell";

// Dev-only (`npm run dev:mock`): every level with its mechanic, for testers jumping
// around. Never routed in a real build — on a public page this table would be the
// answer key for any agent that wandered onto it.
export default function LevelIndexPage() {
  return (
    <Shell runId={null}>
      <h1>Levels (dev)</h1>
      <p className="level-index-note">Mock mode only. Each link starts a fresh manual run.</p>
      <table className="level-index">
        <thead>
          <tr>
            <th>#</th>
            <th>Mechanic</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((level) => (
            <tr key={level.id}>
              <td>
                <Link to={`/level/${level.id}`}>{level.id}</Link>
              </td>
              <td className="level-index-mechanic">
                {level.mechanic} · v{level.variant}
              </td>
              <td>{level.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
