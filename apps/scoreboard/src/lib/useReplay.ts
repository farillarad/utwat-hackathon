import { useCallback, useEffect, useRef, useState } from "react";
import type { LevelResult } from "@shared/schema/run";
import { LADDER_LEVELS } from "../ws/useRunStream";

const MIN_SEGMENT_S = 0.4;

export type ReplaySpeed = 1 | 2 | 4;

export interface ReplayState {
  isPlaying: boolean;
  speed: ReplaySpeed;
  currentTime: number;
  totalTime: number;
  /** Continuous 0-100 position along the same axis LadderAxis already uses. */
  pipPercent: number;
  /** Highest station index "revealed" as of the current virtual time, -1 if none. */
  reachedIndex: number;
  atEnd: boolean;
  canPlay: boolean;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (s: ReplaySpeed) => void;
  seek: (t: number) => void;
}

// Re-enacts a run's own pacing using its recorded duration_s per level — a
// local playback clock over data already in memory (no new fetch, no WS
// subscription). `positions` is the same fixed-column array LadderAxis uses
// for the shared axis, so the pip travels in sync with the rail beneath it.
export function useReplay(levels: LevelResult[], positions: number[], reducedMotion: boolean): ReplayState {
  const byLevel = new Map(levels.map((l) => [l.level, l]));
  const reachedCount = LADDER_LEVELS.reduce((acc, level, i) => (byLevel.has(level) ? i + 1 : acc), 0);
  const segLens = LADDER_LEVELS.map((level) => Math.max(byLevel.get(level)?.duration_s ?? 0, MIN_SEGMENT_S));

  const cumulative: number[] = [];
  let running = 0;
  for (let i = 0; i < reachedCount; i++) {
    if (i > 0) running += segLens[i];
    cumulative.push(running);
  }
  const totalTime = cumulative.length ? cumulative[cumulative.length - 1] : 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<ReplaySpeed>(1);
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) return;
    lastTickRef.current = null;
    const tick = (now: number) => {
      const last = lastTickRef.current ?? now;
      const dt = (now - last) / 1000;
      lastTickRef.current = now;
      setCurrentTime((t) => {
        const next = t + dt * speed;
        if (next >= totalTime) {
          setIsPlaying(false);
          return totalTime;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, speed, totalTime]);

  const play = useCallback(() => {
    if (totalTime <= 0) return;
    setCurrentTime((t) => (t >= totalTime ? 0 : t));
    setIsPlaying(true);
  }, [totalTime]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const restart = useCallback(() => {
    setCurrentTime(0);
    setIsPlaying(totalTime > 0);
  }, [totalTime]);

  const seek = useCallback((t: number) => setCurrentTime(Math.max(0, Math.min(totalTime, t))), [totalTime]);

  const setSpeed = useCallback((s: ReplaySpeed) => setSpeedState(s), []);

  // Reduced motion: no continuous travel — jump straight to the end state,
  // and playback controls become no-ops (there's nothing left to animate).
  const effectiveTime = reducedMotion ? totalTime : currentTime;

  let reachedIndex = -1;
  for (let i = 0; i < cumulative.length; i++) {
    if (effectiveTime >= cumulative[i]) reachedIndex = i;
  }

  let pipPercent = positions[0] ?? 0;
  if (reachedCount > 0) {
    const segStart = reachedIndex >= 0 ? cumulative[reachedIndex] : 0;
    const segEndIdx = reachedIndex + 1;
    if (segEndIdx < reachedCount) {
      const segEnd = cumulative[segEndIdx];
      const segProgress = segEnd > segStart ? (effectiveTime - segStart) / (segEnd - segStart) : 1;
      const posStart = reachedIndex >= 0 ? positions[reachedIndex] : positions[0];
      const posEnd = positions[segEndIdx];
      pipPercent = posStart + (posEnd - posStart) * Math.min(1, Math.max(0, segProgress));
    } else {
      pipPercent = positions[Math.max(0, Math.min(reachedIndex, positions.length - 1))];
    }
  }

  return {
    isPlaying: reducedMotion ? false : isPlaying,
    speed,
    currentTime: effectiveTime,
    totalTime,
    pipPercent,
    reachedIndex,
    atEnd: totalTime > 0 && effectiveTime >= totalTime,
    canPlay: totalTime > 0 && !reducedMotion,
    play,
    pause,
    restart,
    setSpeed,
    seek,
  };
}
