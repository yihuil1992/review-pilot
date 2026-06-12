"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type AtlasMode = "archive" | "night";

const storageKey = "review-pilot-atlas-mode";
const defaultMode: AtlasMode = "night";

function readMode(): AtlasMode {
  if (typeof window === "undefined") {
    return defaultMode;
  }
  const stored = window.localStorage.getItem(storageKey);
  return stored === "archive" || stored === "night" ? stored : defaultMode;
}

function applyMode(mode: AtlasMode) {
  document.documentElement.dataset.atlasMode = mode;
  document.documentElement.classList.toggle("dark", mode === "night");
  window.localStorage.setItem(storageKey, mode);
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<AtlasMode>(defaultMode);

  useEffect(() => {
    const storedMode = readMode();
    setMode(storedMode);
    applyMode(storedMode);
  }, []);

  function toggleMode() {
    setMode((current) => {
      const next = current === "archive" ? "night" : "archive";
      applyMode(next);
      return next;
    });
  }

  const nextLabel = mode === "archive" ? "Night atlas" : "Archive sheet";
  const CurrentIcon = mode === "archive" ? Sun : Moon;

  return (
    <button
      type="button"
      className="rp-theme-toggle"
      aria-label={`Switch to ${nextLabel}`}
      title={`Switch to ${nextLabel}`}
      data-compact={compact ? "true" : "false"}
      onClick={toggleMode}
    >
      <CurrentIcon aria-hidden="true" />
      <span>{mode === "archive" ? "Archive" : "Night"}</span>
    </button>
  );
}
