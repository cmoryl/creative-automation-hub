import { useRef, useState } from 'react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** Tooltip text. Empty string or undefined = no tooltip rendered. */
  text: string | undefined;
  children: React.ReactNode;
  /** Which side of the trigger the tooltip appears on. Default: 'top' */
  position?: TooltipPosition;
  /** Hover delay in ms before the tooltip appears. Default: 350 */
  delay?: number;
  /** Max pixel width of the tooltip box. Default: 230 */
  maxWidth?: number;
  /** CSS display value for the wrapper. Default: 'inline-flex' */
  display?: string;
}

/**
 * Wraps any element with a hover tooltip.
 *
 * Usage:
 *   <Tooltip text="Runs all preflight checks">
 *     <button>Run Preflight</button>
 *   </Tooltip>
 *
 *   <Tooltip text="Engine ready" position="right">
 *     <span className="dot green" />
 *   </Tooltip>
 */
export function Tooltip({
  text,
  children,
  position = 'top',
  delay = 350,
  maxWidth = 230,
  display = 'inline-flex',
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // No tooltip text — render children bare
  if (!text) return <>{children}</>;

  function show() {
    timer.current = setTimeout(() => setVisible(true), delay);
  }
  function hide() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setVisible(false);
  }

  return (
    <div
      className="tooltip-wrap"
      style={{ position: 'relative', display }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          className={`tooltip-box tooltip-${position}`}
          style={{ maxWidth }}
          role="tooltip"
        >
          {text}
        </div>
      )}
    </div>
  );
}
