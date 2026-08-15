"use client";

import Image from "next/image";
import { type MouseEvent, useState } from "react";

interface HoverImageCycleProps {
  images: string[];
  alt: string;
  sizes: string;
  imageClassName?: string;
}

// Wildberries-style product photo cycling: moving the cursor across the image
// horizontally switches between photos based on which "slice" of the width
// the cursor is over, with thin segment indicators along the top showing how
// many photos there are and which one is active.
//
// The other photos only start loading on the first hover (not on mount) --
// a catalog grid can have dozens of cards on screen at once, and eagerly
// loading up to _CARD_IMAGE_LIMIT images each would multiply the page's
// image requests for a hover feature most visits never use.
export function HoverImageCycle({ images, alt, sizes, imageClassName = "" }: HoverImageCycleProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const hasMultiple = images.length > 1;

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!hasMultiple) return;
    if (!engaged) setEngaged(true);
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width - 1);
    const index = Math.floor((relativeX / rect.width) * images.length);
    setActiveIndex(Math.min(Math.max(index, 0), images.length - 1));
  }

  const showStack = hasMultiple && engaged;

  return (
    <div
      className="relative h-full w-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setActiveIndex(0)}
    >
      {showStack && (
        <div className="pointer-events-none absolute inset-x-1.5 top-1.5 z-10 flex gap-1">
          {images.map((_, index) => (
            <span
              key={index}
              className={`h-[3px] flex-1 rounded-full shadow-sm transition-colors ${
                index === activeIndex ? "bg-white" : "bg-white/50"
              }`}
            />
          ))}
        </div>
      )}

      {showStack ? (
        images.map((src, index) => (
          <Image
            key={src}
            src={src}
            alt={alt}
            fill
            unoptimized
            sizes={sizes}
            className={`absolute inset-0 transition-opacity duration-150 ${imageClassName} ${
              index === activeIndex ? "opacity-100" : "opacity-0"
            }`}
          />
        ))
      ) : (
        <Image
          src={images[0]}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          onLoad={() => setLoaded(true)}
          className={`transition-opacity duration-200 ease-out ${imageClassName} ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
