"use client";

import Image from "next/image";
import { useState } from "react";

import type { ProductImage } from "@/entities/product/api";

export function ProductGallery({ images, alt }: { images: ProductImage[]; alt: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex];

  if (!active) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
        Нет фото
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
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

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Фото ${index + 1}`}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded border ${
                index === activeIndex
                  ? "border-zinc-900 dark:border-zinc-100"
                  : "border-transparent"
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
    </div>
  );
}
