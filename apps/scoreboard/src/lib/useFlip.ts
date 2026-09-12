import { useLayoutEffect, useRef, type RefObject } from "react";

// Generic FLIP (First-Last-Invert-Play) reorder animation: whenever `orderKey`
// changes, animates every child tagged with data-flip-key from its previous
// screen position to its new one, instead of the browser snapping rows to
// their new positions instantly. Used for the leader-reorder animation —
// nothing here is idle/looping, it only runs on an actual order change.
export function useFlip(containerRef: RefObject<HTMLElement | null>, orderKey: string, disabled: boolean, duration = 300) {
  const prevRectsRef = useRef<Map<string, DOMRect> | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const children = Array.from(container.querySelectorAll<HTMLElement>("[data-flip-key]"));
    const prevRects = prevRectsRef.current;

    if (!disabled && prevRects) {
      for (const child of children) {
        const key = child.dataset.flipKey!;
        const prev = prevRects.get(key);
        if (!prev) continue;
        const next = child.getBoundingClientRect();
        const deltaY = prev.top - next.top;
        if (Math.abs(deltaY) < 1) continue;
        child.style.transition = "none";
        child.style.transform = `translateY(${deltaY}px)`;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        child.getBoundingClientRect(); // force reflow before clearing the transform
        requestAnimationFrame(() => {
          child.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          child.style.transform = "";
        });
      }
    }

    prevRectsRef.current = new Map(children.map((c) => [c.dataset.flipKey!, c.getBoundingClientRect()]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, disabled]);
}
