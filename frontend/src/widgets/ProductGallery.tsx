"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import type { ProductImage } from "@/entities/product/api";

interface ProductGalleryProps {
  images: ProductImage[];
  alt: string;
  /** Edge-to-edge mode for the quick view modal: the image bleeds to fill
   * whatever box the parent gives it instead of sitting in its own rounded
   * aspect-square card. There's no room for a thumbnail rail alongside that,
   * so navigation is arrows + keyboard only in this mode. */
  fill?: boolean;
}

export function ProductGallery({ images, alt, fill = false }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex];
  const hasMultiple = images.length > 1;

  function goTo(index: number) {
    setActiveIndex(((index % images.length) + images.length) % images.length);
  }

  // Arrow keys move the image whenever the gallery is on screen (product page
  // or the quick view modal) -- there is only ever one gallery mounted at a
  // time, so a document-level listener can't collide with another instance.
  useEffect(() => {
    if (!hasMultiple) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        setActiveIndex((current) => (current - 1 + images.length) % images.length);
      } else if (event.key === "ArrowRight") {
        setActiveIndex((current) => (current + 1) % images.length);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hasMultiple, images.length]);

  if (!active) {
    return (
      <div
        className={`flex items-center justify-center bg-surface text-ink-muted ${
          fill ? "h-full w-full" : "aspect-square w-full rounded-xl"
        }`}
      >
        Нет фото
      </div>
    );
  }

  const mainImage = (
    <div
      className={`relative overflow-hidden bg-surface ${
        fill ? "h-full w-full" : "aspect-square w-full rounded-xl lg:flex-1"
      }`}
    >
      {/* unoptimized: presigned MinIO URLs aren't reachable from inside the
          frontend container, which is where Next's image optimizer would run. */}
      <Image
        src={active.url}
        alt={active.alt ?? alt}
        fill
        unoptimized
        preload
        sizes={fill ? "(min-width: 640px) 55vw, 100vw" : "(min-width: 1024px) 50vw, 100vw"}
        className="object-cover"
      />

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={() => goTo(activeIndex - 1)}
            aria-label="Предыдущее фото"
            className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-bg/90 text-ink shadow-md transition hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:left-3"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(activeIndex + 1)}
            aria-label="Следующее фото"
            className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-bg/90 text-ink shadow-md transition hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:right-3"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-full bg-ink/70 px-2 py-0.5 font-mono text-xs text-white">
            {activeIndex + 1}/{images.length}
          </div>
        </>
      )}
    </div>
  );

  if (fill) return mainImage;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto lg:order-first lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Фото ${index + 1}`}
              aria-current={index === activeIndex}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                index === activeIndex ? "ring-2 ring-brand" : "ring-ink/15 hover:ring-ink/30"
              }`}
            >
              <Image
                src={image.thumbnail_url}
                alt={image.alt ?? alt}
                fill
                unoptimized
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {mainImage}
    </div>
  );
}
