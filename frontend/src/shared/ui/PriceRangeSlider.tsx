"use client";

import { useState } from "react";

interface PriceRangeSliderProps {
  min: number;
  max: number;
  defaultMin?: number;
  defaultMax?: number;
}

// Two native <input type="range"> stacked on the same track (the standard
// dual-handle trick): each is pointer-events-none except its own thumb, so
// clicks land on whichever handle's visible knob they hit. The visible
// number inputs stay in the same <form> (see FiltersForm) and share the
// price_min/price_max names, so a normal form submit still works with no
// client-side fetch wiring here.
export function PriceRangeSlider({ min, max, defaultMin, defaultMax }: PriceRangeSliderProps) {
  const [lo, setLo] = useState(defaultMin ?? min);
  const [hi, setHi] = useState(defaultMax ?? max);

  const range = Math.max(max - min, 1);
  const loPct = ((lo - min) / range) * 100;
  const hiPct = ((hi - min) / range) * 100;

  const thumbClass =
    "absolute inset-x-0 top-0 h-5 w-full cursor-pointer appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 " +
    "[&::-webkit-slider-thumb]:border-brand [&::-webkit-slider-thumb]:bg-bg [&::-webkit-slider-thumb]:shadow " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-brand " +
    "[&::-moz-range-thumb]:bg-bg [&::-moz-range-thumb]:shadow pointer-events-none";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="price_min">
          Цена от
        </label>
        <input
          id="price_min"
          type="number"
          name="price_min"
          min={min}
          max={hi}
          value={lo}
          onChange={(event) => setLo(Math.min(Number(event.target.value) || min, hi))}
          className="w-full rounded-lg border border-ink/15 bg-bg px-2.5 py-1.5 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <span className="text-ink-muted" aria-hidden="true">
          –
        </span>
        <label className="sr-only" htmlFor="price_max">
          Цена до
        </label>
        <input
          id="price_max"
          type="number"
          name="price_max"
          min={lo}
          max={max}
          value={hi}
          onChange={(event) => setHi(Math.max(Number(event.target.value) || max, lo))}
          className="w-full rounded-lg border border-ink/15 bg-bg px-2.5 py-1.5 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      <div className="relative h-5">
        <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-ink/10" />
        <div
          className="absolute top-2 h-1 rounded-full bg-brand"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          aria-label="Цена от"
          min={min}
          max={max}
          value={lo}
          onChange={(event) => setLo(Math.min(Number(event.target.value), hi))}
          className={thumbClass}
        />
        <input
          type="range"
          aria-label="Цена до"
          min={min}
          max={max}
          value={hi}
          onChange={(event) => setHi(Math.max(Number(event.target.value), lo))}
          className={thumbClass}
        />
      </div>
    </div>
  );
}
