"use client";

import Image from "next/image";
import { useState } from "react";

import type { ProductImage } from "@/entities/product/api";

export function ProductGallery({ images, alt }: { images: ProductImage[]; alt: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex];

  if (!active) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface text-ink-muted">
        Нет фото
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto lg:order-first lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActiveIndex(index)}
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

      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface lg:flex-1">
        {/* unoptimized: presigned MinIO URLs aren't reachable from inside the
            frontend container, which is where Next's image optimizer would run. */}
        <Image
          src={active.url}
          alt={active.alt ?? alt}
          fill
          unoptimized
          preload
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
