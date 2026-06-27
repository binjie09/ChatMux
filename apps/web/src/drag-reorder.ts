import { useCallback, useRef, useState, type DragEvent } from "react";

// arrayMove returns a new list with the item at `from` moved to position `to`.
// It is the optimistic counterpart to the server-side reorder so the UI can
// update instantly while the request is in flight.
export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// dragItemClassName adds dragging / drag-over modifier classes for visual
// feedback during a reorder.
export function dragItemClassName(
  base: string,
  index: number,
  drag: { dragIndex: number | null; overIndex: number | null },
): string {
  const classes = [base];
  if (drag.dragIndex === index) {
    classes.push("dragging");
  }
  if (drag.overIndex === index && drag.dragIndex !== index) {
    classes.push("drag-over");
  }
  return classes.join(" ");
}

export type DragReorderItemProps = {
  draggable: true;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: (event: DragEvent) => void;
};

// useDragReorder exposes per-item drag handlers for a flat list reordering
// itself by index. Handlers call stopPropagation so a nested list (e.g. window
// rows inside a session) does not bubble drops up to its enclosing list.
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const sourceRef = useRef<number | null>(null);

  const propsFor = useCallback(
    (index: number): DragReorderItemProps => ({
      draggable: true,
      onDragStart: (event) => {
        sourceRef.current = index;
        setDragIndex(index);
        setOverIndex(null);
        event.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        if (sourceRef.current !== null && sourceRef.current !== index) {
          setOverIndex(index);
        }
      },
      onDrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const from = sourceRef.current;
        const to = index;
        sourceRef.current = null;
        setDragIndex(null);
        setOverIndex(null);
        if (from !== null && from !== to) {
          onReorder(from, to);
        }
      },
      onDragEnd: () => {
        sourceRef.current = null;
        setDragIndex(null);
        setOverIndex(null);
      },
    }),
    [onReorder],
  );

  return { dragIndex, overIndex, propsFor };
}
