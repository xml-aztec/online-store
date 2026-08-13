import { BadgeCheck, Star } from "lucide-react";

import type { Review } from "@/entities/reviews/api";

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function ProductReviews({ reviews, total }: { reviews: Review[]; total: number }) {
  if (total === 0) {
    return <p className="text-sm text-ink-muted">Пока нет отзывов — будьте первым.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-xl border border-ink/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">{review.author_label}</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={index}
                  className={`h-3.5 w-3.5 ${
                    index < review.rating ? "fill-ink text-ink" : "text-ink/15"
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-mono text-xs text-ink-muted">
              {formatReviewDate(review.created_at)}
            </p>
            {review.is_verified_purchase && (
              <span className="flex items-center gap-1 text-xs font-medium text-success-700">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Проверенная покупка
              </span>
            )}
          </div>
          {review.comment && <p className="mt-2 text-sm text-ink">{review.comment}</p>}
        </li>
      ))}
    </ul>
  );
}
