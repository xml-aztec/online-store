"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listAdminReviews, moderateReview } from "@/entities/reviews/adminApi";
import { ApiError } from "@/shared/api/client";

const QUERY_KEY = "admin-reviews";

const TABS = [
  { value: "pending", label: "На модерации" },
  { value: "approved", label: "Опубликованы" },
  { value: "rejected", label: "Отклонены" },
];

export default function AdminReviewsPage() {
  const [status, setStatus] = useState("pending");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEY, status],
    queryFn: () => listAdminReviews(status),
  });

  const moderateMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "approved" | "rejected" }) =>
      moderateReview(id, next),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось изменить статус отзыва"),
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">Отзывы</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              status === tab.value
                ? "bg-brand text-white"
                : "border border-ink/15 text-ink hover:border-brand/40"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-accent-sale-700">{error}</p>}
      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {data && data.items.length === 0 && <p className="text-ink-muted">Отзывов нет</p>}

      {data && data.items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.items.map((review) => (
            <li key={review.id} className="rounded-lg border border-ink/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/products/${review.product_id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {review.product_name}
                  </Link>
                  <span className="text-sm text-ink-muted">— {review.author_label}</span>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      className={`h-4 w-4 ${
                        index < review.rating ? "fill-ink text-ink" : "text-ink/15"
                      }`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              </div>
              {review.comment && <p className="mt-2 text-sm text-ink">{review.comment}</p>}
              <p className="mt-2 font-mono text-xs text-ink-muted">
                {new Date(review.created_at).toLocaleString("ru-RU")}
              </p>

              {status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={moderateMutation.isPending}
                    onClick={() => moderateMutation.mutate({ id: review.id, next: "approved" })}
                    className="rounded-lg bg-success px-3 py-1.5 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50"
                  >
                    Опубликовать
                  </button>
                  <button
                    type="button"
                    disabled={moderateMutation.isPending}
                    onClick={() => moderateMutation.mutate({ id: review.id, next: "rejected" })}
                    className="rounded-lg border border-accent-sale/40 px-3 py-1.5 text-sm text-accent-sale-700 hover:border-accent-sale/60 disabled:opacity-50"
                  >
                    Отклонить
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
