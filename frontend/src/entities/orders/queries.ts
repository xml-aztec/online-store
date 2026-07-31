"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { checkout, getCheckoutConfig, getOrderByNumber } from "./api";

export function useCheckoutConfigQuery() {
  return useQuery({ queryKey: ["checkout-config"], queryFn: getCheckoutConfig });
}

export function useCheckoutMutation() {
  return useMutation({ mutationFn: checkout });
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const PENDING_STATUSES = new Set(["pending", "awaiting_payment"]);

export function useOrderStatusQuery(number: string, email: string | undefined) {
  // Captured once when polling starts for this page instance -- ТЗ 7.1 п.5: the
  // payment webhook may arrive after the redirect, so poll every 3s for up to
  // 2 minutes rather than trusting the status at redirect time.
  const [startedAt] = useState(() => Date.now());

  return useQuery({
    queryKey: ["order", number, email],
    queryFn: () => getOrderByNumber(number, email ?? ""),
    enabled: Boolean(email),
    refetchInterval: (query) => {
      const current = query.state.data;
      const stillPending = !current || PENDING_STATUSES.has(current.status);
      if (stillPending && Date.now() - startedAt < POLL_TIMEOUT_MS) {
        return POLL_INTERVAL_MS;
      }
      return false;
    },
  });
}
