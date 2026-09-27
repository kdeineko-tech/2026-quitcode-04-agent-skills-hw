"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { QuoteStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;

export function QuoteStatusPoller({ status }: { status: QuoteStatus }) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "queued") return;
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, router]);

  return null;
}
