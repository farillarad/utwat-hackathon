import { useEffect, useState } from "react";

// Single source of truth for prefers-reduced-motion — every new animation in
// this pass (traversal, flare, shake, stagger) checks this and either skips
// straight to the end state or drops to an instant, non-animated change.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
