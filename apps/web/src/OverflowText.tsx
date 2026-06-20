import { useRef, useState, type ElementType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./overflow-text.css";

type OverflowTextProps = {
  children: ReactNode;
  /** Tooltip content; defaults to the element's own text. */
  tooltip?: string;
  className?: string;
  as?: ElementType;
};

/**
 * Renders a single line of text that ellipses when it overflows. On hover, if
 * the text is actually clipped, a tooltip with the full content is shown (ported
 * to the document body so it is never cut off by an overflow:hidden ancestor).
 */
export function OverflowText({ children, tooltip, className, as: Tag = "span" }: OverflowTextProps) {
  // Polymorphic ref: the element type varies with `as`, so keep it loose.
  const nodeRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const label = tooltip ?? (typeof children === "string" ? children : "");

  function handleMouseEnter() {
    const el = nodeRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) {
      return;
    }
    const rect = el.getBoundingClientRect();
    setPosition({ left: rect.left + rect.width / 2, top: rect.top });
    setVisible(true);
  }

  return (
    <>
      <Tag
        ref={nodeRef as never}
        className={className ? `overflow-text ${className}` : "overflow-text"}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </Tag>
      {visible && label
        ? createPortal(
            <div className="overflow-tooltip" role="tooltip" style={{ left: position.left, top: position.top }}>
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
