import { type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// SortableItemBag is the handle each rendered item receives. Spread `ref` and
// `style` on the item's outer element (the transform/transition is what gives
// the smooth glide), and spread `dragHandleProps` on the element that should
// start a drag — usually the same element. PointerSensor needs a small movement
// before it starts a drag, so plain clicks on buttons inside still work.
export type SortableItemBag = {
  ref: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  isDragging: boolean;
};

export function SortableList<T>(props: {
  items: T[];
  ids: string[];
  onReorder: (from: number, to: number) => void;
  orientation: "vertical" | "horizontal";
  className?: string;
  disabled?: boolean;
  children: (item: T, index: number, sortable: SortableItemBag) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const from = props.ids.indexOf(String(active.id));
    const to = props.ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) {
      props.onReorder(from, to);
    }
  };

  const strategy = props.orientation === "horizontal" ? horizontalListSortingStrategy : verticalListSortingStrategy;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={props.ids} strategy={strategy}>
        <div className={props.className}>
          {props.items.map((item, index) => (
            <SortableItem key={props.ids[index]} id={props.ids[index]} disabled={props.disabled}>
              {(sortable) => props.children(item, index, sortable)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem(props: { id: string; disabled?: boolean; children: (sortable: SortableItemBag) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
    disabled: props.disabled,
  });
  const sortable: SortableItemBag = {
    ref: setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    dragHandleProps: { ...attributes, ...listeners } as React.HTMLAttributes<HTMLElement>,
    isDragging,
  };
  return <>{props.children(sortable)}</>;
}
