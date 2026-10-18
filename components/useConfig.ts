"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { AppConfig } from "@/lib/types";

export function useConfig(): AppConfig | null {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    api<AppConfig>("/api/config").then(setCfg).catch(() => setCfg(null));
  }, []);
  return cfg;
}
