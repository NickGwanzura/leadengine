'use client';

import { useEffect, useRef, useState } from 'react';

function bounded(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function AnimatedPercent({ value, className = '' }: { value: number; className?: string }) {
  const target = bounded(value);
  const [display, setDisplay] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const from = current.current;
    const duration = 650;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let started = 0;

    const tick = (now: number) => {
      if (!started) started = now;
      const elapsed = reducedMotion ? 1 : Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = Math.round(from + (target - from) * eased);
      current.current = next;
      setDisplay(next);
      if (elapsed < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return <span className={className} aria-label={`${target} percent`}>{display}%</span>;
}

export function AnimatedProgress({ value, label = 'Progress' }: { value: number; label?: string }) {
  const target = bounded(value);
  return <div className="animated-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={target}>
    <span className="animated-progress-track"><span className="animated-progress-fill" style={{ width: `${target}%` }}/></span>
    <AnimatedPercent value={target} className="animated-progress-value"/>
  </div>;
}
