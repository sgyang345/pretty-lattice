import { Copy, X } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { BrillouinSelectablePoint } from "../scene/brillouinSelection";
import { formatStructureNumber } from "../model/structurePrecision";
import { GLASS_SURFACE_CLASS, TOOL_ICON_BUTTON_CLASS } from "./surface";

const K_POINT_LABEL_WIDTH = 3;
const K_POINT_COORDINATE_WIDTH = 19;

export function KPointInspectorCard({
  infos,
  isInspectorOpen,
  onClose,
}: {
  infos: BrillouinSelectablePoint[];
  isInspectorOpen: boolean;
  onClose: () => void;
}) {
  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text);
  }, []);

  return (
    <aside
      aria-label="Selected k-points"
      className={cn(
        "absolute bottom-4 left-16 z-30 max-h-[min(50vh,22rem)] w-fit max-w-[min(650px,calc(100vw-2rem))] overflow-auto rounded-xl border px-2.5 py-2 font-mono text-xs shadow-xl shadow-foreground/10",
        "transition-[left] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        "max-[760px]:bottom-4 max-[760px]:left-4",
        isInspectorOpen ? "min-[761px]:left-[376px]" : null,
        GLASS_SURFACE_CLASS,
      )}
    >
      <TooltipProvider delayDuration={500}>
        <div className="grid gap-1.5">
          <div className="grid h-6 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-2">
            <span className="text-[0.72rem] font-semibold text-muted-foreground">
              K-points
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close k-point info"
                  className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
                  onClick={onClose}
                >
                  <X aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close k-point info</TooltipContent>
            </Tooltip>
          </div>
          {infos.map((info) => {
            const label = formatKPointLabel(info.label);
            const coordinates = formatKPointCoordinate(info.fractional);
            const copyText = coordinates.join(" ");
            return (
              <div
                className="grid h-6 grid-cols-[3ch_19ch_19ch_19ch_1.5rem] items-center gap-x-[1ch]"
                key={info.id}
              >
                <span className="min-w-0 whitespace-pre text-left text-[0.75rem] font-semibold text-foreground">
                  {label}
                </span>
                {coordinates.map((coordinate, index) => (
                  <span
                    className="whitespace-pre text-right text-[0.75rem] font-semibold tabular-nums text-foreground"
                    key={`${info.id}-${index}`}
                  >
                    {coordinate}
                  </span>
                ))}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy ${info.label} fractional coordinates`}
                      className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
                      onClick={() => handleCopy(copyText)}
                    >
                      <Copy aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Copy k-point fractional coordinates</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </aside>
  );
}

function formatKPointCoordinate(values: [number, number, number]): [string, string, string] {
  return values.map(formatFixedCoordinate) as [string, string, string];
}

function formatKPointLabel(label: string): string {
  return label.slice(0, K_POINT_LABEL_WIDTH).padEnd(K_POINT_LABEL_WIDTH, " ");
}

function formatFixedCoordinate(value: number): string {
  return formatStructureNumber(value).padStart(K_POINT_COORDINATE_WIDTH, " ");
}
