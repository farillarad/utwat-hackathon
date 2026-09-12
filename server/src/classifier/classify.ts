import { RUBRIC, type FailureMode } from "./rubric";

// Owner: Farill — v1: LLM-rubric classification against the stored event trace.
// Swap for a trained classifier over trace features if hours 14-18 are ahead of schedule.
// Validate against a handful of hand-labeled runs before trusting this live (PRD §6).
export async function classifyOutcome(run_id: string, level: number): Promise<FailureMode> {
  // TODO: pull the event trace for (run_id, level) from the run store, send it plus
  // RUBRIC to an LLM, and parse the returned label.
  void run_id;
  void level;
  void RUBRIC;
  return "assumed_success_incorrectly";
}
