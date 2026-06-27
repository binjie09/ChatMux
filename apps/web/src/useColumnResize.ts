import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type ColumnResizeOptions = {
  storageKey: string;
  defaultWidth: number;
  /** Dragging at or below this width collapses the column on release. */
  collapseThreshold: number;
  maxWidth: number;
  collapsedWidth: number;
};

function readStoredWidth(options: ColumnResizeOptions): number {
  const stored = Number(localStorage.getItem(options.storageKey));
  const { collapseThreshold, maxWidth, defaultWidth } = options;
  if (Number.isFinite(stored) && stored >= collapseThreshold && stored <= maxWidth) {
    return stored;
  }
  return defaultWidth;
}

/**
 * Owns the width and collapsed state of a single app-shell column. While
 * dragging, the visible width never drops below `collapseThreshold` (so the
 * column never looks cramped mid-drag); releasing below that threshold snaps
 * to `collapsedWidth`. The chosen width persists across reloads.
 */
export function useColumnResize(options: ColumnResizeOptions) {
  const { storageKey, collapseThreshold, maxWidth, collapsedWidth } = options;
  const [width, setWidth] = useState(() => readStoredWidth(options));
  const [collapsed, setCollapsed] = useState(false);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(width);
  const collapsedRef = useRef(collapsed);
  widthRef.current = width;
  collapsedRef.current = collapsed;

  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const beginResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = collapsedRef.current ? collapsedWidth : widthRef.current;
    let wouldCollapse = collapsedRef.current;
    setResizing(true);

    function onMove(moveEvent: PointerEvent) {
      const next = startWidth + (moveEvent.clientX - startX);
      if (next <= collapseThreshold) {
        wouldCollapse = true;
        return;
      }
      wouldCollapse = false;
      setCollapsed(false);
      setWidth(Math.min(maxWidth, Math.max(collapseThreshold, next)));
    }

    function onUp(upEvent: PointerEvent) {
      target.releasePointerCapture(upEvent.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      setResizing(false);
      setCollapsed(wouldCollapse);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }, [collapseThreshold, collapsedWidth, maxWidth]);

  const effectiveWidth = collapsed ? collapsedWidth : width;

  return { width, collapsed, effectiveWidth, resizing, beginResize, setCollapsed };
}
