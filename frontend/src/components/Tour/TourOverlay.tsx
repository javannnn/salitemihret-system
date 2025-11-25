import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

import { useTour } from "@/context/TourContext";
import { Button } from "@/components/ui";

const CLAMP_PADDING = 16;

export function TourOverlay() {
  const { active, currentIndex, currentStep, steps, targetRect, nextStep, previousStep, skipTour, skipTourForNow } = useTour();
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [tooltipSize, setTooltipSize] = useState<{ width: number; height: number }>({ width: 340, height: 200 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(query.matches);
    const handler = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        skipTour();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, skipTour]);

  useEffect(() => {
    if (active && tooltipRef.current) {
      tooltipRef.current.focus();
    }
  }, [active, currentStep?.id]);

  useLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    setTooltipSize({ width: rect.width, height: rect.height });
  }, [currentStep?.id]);

  const tooltipPosition = useMemo(() => {
    if (!targetRect) {
      return { top: CLAMP_PADDING, left: CLAMP_PADDING, placement: "below" as const };
    }
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = tooltipSize.width || 340;
    const height = tooltipSize.height || 200;
    const left = Math.min(viewportWidth - width - CLAMP_PADDING, Math.max(CLAMP_PADDING, targetRect.left));
    const spaceBelow = viewportHeight - targetRect.bottom - CLAMP_PADDING;
    const spaceAbove = targetRect.top - CLAMP_PADDING;
    const placeBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
    const top = placeBelow
      ? Math.min(viewportHeight - height - CLAMP_PADDING, targetRect.bottom + 12)
      : Math.max(CLAMP_PADDING, targetRect.top - height - 12);
    return { top, left, placement: placeBelow ? "below" : "above" };
  }, [targetRect, tooltipSize.height, tooltipSize.width]);

  if (!active || !currentStep) {
    return null;
  }

  const totalSteps = steps.length || 1;
  const highlightStyle = targetRect
    ? {
        top: Math.max(CLAMP_PADDING, targetRect.top - 10),
        left: Math.max(CLAMP_PADDING, targetRect.left - 10),
        width: targetRect.width + 20,
        height: targetRect.height + 20,
      }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[120] pointer-events-none">
      <div className="absolute inset-0 bg-black/60 pointer-events-none" />
      {highlightStyle && (
        <div
          className={`absolute rounded-3xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-accent/80 ${
            prefersReducedMotion ? "" : "transition-all duration-150"
          } pointer-events-none bg-transparent`}
          style={highlightStyle}
        />
      )}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
        className="absolute w-[340px] max-w-[90vw] pointer-events-auto"
        style={tooltipPosition}
      >
        <div
          ref={tooltipRef}
          tabIndex={-1}
          className="p-5 space-y-3 shadow-3xl border border-white/20 bg-slate-950/90 text-slate-50 backdrop-blur-xl rounded-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-300">
                Step {currentIndex + 1} of {totalSteps}
              </div>
              <h3 className="text-lg font-semibold leading-tight text-white">{currentStep.title}</h3>
              <p className="text-sm text-slate-200 leading-relaxed">{currentStep.description}</p>
              {!targetRect && <p className="text-xs text-amber-300">Looking for this part of the UI…</p>}
            </div>
            <button
              type="button"
              onClick={skipTour}
              className="text-slate-300 hover:text-white transition"
              aria-label="Skip tour"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={skipTourForNow}>
                Skip for now
              </Button>
              <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={skipTour}>
                Skip forever
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-sm"
                onClick={previousStep}
                disabled={currentIndex === 0}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                className="px-3 py-1.5 text-sm"
                onClick={currentIndex === totalSteps - 1 ? skipTour : nextStep}
              >
                {currentIndex === totalSteps - 1 ? "Finish" : "Next"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
