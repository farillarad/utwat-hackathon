import { useEffect, useRef, useState } from "react";

// Fires a transient `true` for `duration` ms the moment `value` changes to
// something satisfying `predicate` (e.g. "this row just became a failure"),
// then resets to false on its own. Backs every one-shot transition animation
// in this pass (severance flare, row shake, current-node entrance) — never a
// continuous/looping effect, and never fires on first mount.
export function useJustChanged<T>(value: T, duration: number, predicate: (v: T) => boolean = () => true): boolean {
  const [justChanged, setJustChanged] = useState(false);
  const prevRef = useRef<T | undefined>(undefined);
  const mountedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (prev !== value && predicate(value)) {
      setJustChanged(true);
      const timer = setTimeout(() => setJustChanged(false), duration);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return justChanged;
}
