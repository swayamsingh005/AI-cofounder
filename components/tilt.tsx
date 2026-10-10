"use client";

import { cloneElement, isValidElement, PointerEvent, ReactElement, HTMLAttributes } from "react";

export default function Tilt({ children, intensity = 7 }: { children: ReactElement; intensity?: number }) {

  function handleMove(event: PointerEvent<HTMLElement>) {
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--tilt-x", `${(-py * intensity).toFixed(2)}deg`);
    node.style.setProperty("--tilt-y", `${(px * intensity).toFixed(2)}deg`);
    node.style.setProperty("--glare-x", `${((px + 0.5) * 100).toFixed(1)}%`);
    node.style.setProperty("--glare-y", `${((py + 0.5) * 100).toFixed(1)}%`);
  }

  function reset(event: PointerEvent<HTMLElement>) {
    const node = event.currentTarget;
    node.style.setProperty("--tilt-x", "0deg");
    node.style.setProperty("--tilt-y", "0deg");
  }

  if (!isValidElement(children)) return children;
  const props = children.props as { className?: string };
  return cloneElement(children as ReactElement<HTMLAttributes<HTMLElement>>, {
    onPointerMove: handleMove,
    onPointerLeave: reset,
    className: `${props.className ?? ""} tilt-3d`.trim(),
  });
}
