export type GauntletEventType =
  | "click"
  | "input"
  | "nav"
  | "dom_mutation"
  | "level_start"
  | "level_end";

export interface GauntletEvent {
  run_id: string;
  level: number;
  ts: number;
  type: GauntletEventType;
  target?: string;
  value?: string;
  screenshot_ref?: string;
}
