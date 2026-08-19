import { Copy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  atomInspectorCopyText,
  atomVectorActualInfoForAtom,
  formatAtomCoordinateForDisplay,
  formatAtomVectorForDisplay,
  formatAtomVectorLengthForDisplay,
  formatCellOffset,
  type InspectedAtomInfo,
} from "./atomInspector";
import { atomColorForScheme, type ElementColorOverrides } from "./colorSchemes";
import {
  atomLabelForAtom,
  type AtomVectorSettings,
  type StyleState,
} from "../model";
import { GLASS_SURFACE_CLASS, TOOL_ICON_BUTTON_CLASS } from "./surface";

const ATOM_INFO_COPY_MESSAGE_TIMEOUT_MS = 1800;
const ATOM_INFO_COPY_BUTTON_CLASS =
  "size-7 rounded-[9px] border border-foreground/20 bg-background/95 text-foreground shadow-sm shadow-foreground/10 hover:border-foreground/30 hover:bg-accent hover:text-accent-foreground [&_svg]:size-3.5";

export function AtomInspectorCard({
  colorScheme,
  colorOverrides,
  atomVectors,
  info,
  isInspectorOpen,
  onClose,
}: {
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  atomVectors: AtomVectorSettings | null;
  info: InspectedAtomInfo;
  isInspectorOpen: boolean;
  onClose: () => void;
}) {
  const { atom, canonicalAtom } = info;
  const atomColor = atomColorForScheme(canonicalAtom, colorScheme, colorOverrides);
  const atomLabel = atomLabelForAtom(canonicalAtom, info.sceneAtoms);
  const vectorInfo = atomVectorActualInfoForAtom(
    canonicalAtom,
    info.sceneAtoms,
    atomVectors,
  );
  const [copyState, setCopyState] = useState<"copied" | "error" | null>(null);
  const copyMessageTimeoutRef = useRef<number | null>(null);
  const handleCopy = useCallback(async () => {
    if (copyMessageTimeoutRef.current !== null) {
      window.clearTimeout(copyMessageTimeoutRef.current);
      copyMessageTimeoutRef.current = null;
    }

    if (!navigator.clipboard?.writeText) {
      setCopyState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(atomInspectorCopyText(info, atomVectors));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }, [atomVectors, info]);

  useEffect(() => {
    if (!copyState) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState(null);
      copyMessageTimeoutRef.current = null;
    }, ATOM_INFO_COPY_MESSAGE_TIMEOUT_MS);
    copyMessageTimeoutRef.current = timeoutId;

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyState]);

  return (
    <aside
      aria-label="Selected atom"
      className={cn(
        "absolute left-4 top-52 z-30 w-[300px] rounded-xl border px-3 py-2.5 font-mono text-xs shadow-xl shadow-foreground/10",
        "transition-[left] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        "max-[760px]:w-[calc(100vw-2rem)]",
        isInspectorOpen ? "min-[761px]:left-[376px]" : null,
        GLASS_SURFACE_CLASS,
      )}
    >
      <div className="relative grid h-7 grid-cols-[1.5rem_0.875rem_minmax(0,1fr)_1.75rem] items-center gap-2">
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close atom info"
                className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close atom info</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <span
          aria-hidden="true"
          className="size-3.5 shrink-0 rounded-full border border-foreground/10 shadow-sm"
          style={{ backgroundColor: atomColor }}
        />
        <span className="min-w-0 whitespace-nowrap text-[0.78rem] font-semibold text-foreground">
          {atomLabel}
        </span>

        <div className="flex justify-end">
          <TooltipProvider delayDuration={500}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Copy all atom info"
                  className={cn(TOOL_ICON_BUTTON_CLASS, ATOM_INFO_COPY_BUTTON_CLASS)}
                  onClick={() => void handleCopy()}
                >
                  <Copy aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy all atom info</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {copyState ? (
          <span
            role="status"
            className={cn(
              "absolute right-0 top-full z-10 mt-1 rounded-md border bg-background/95 px-1.5 py-1 text-[0.64rem] font-medium leading-none shadow-sm",
              copyState === "copied" ? "border-foreground/15 text-foreground" : "border-destructive/25 text-destructive",
            )}
          >
            {copyState === "copied" ? "Copied" : "Copy failed"}
          </span>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-[5.8rem_minmax(0,1fr)] gap-x-2 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Fractional</dt>
        <dd className="truncate text-right text-foreground">
          {formatAtomCoordinateForDisplay(canonicalAtom.fractionalPosition)}
        </dd>
        <dt className="text-muted-foreground">Cartesian</dt>
        <dd className="truncate text-right text-foreground">
          {formatAtomCoordinateForDisplay(canonicalAtom.position)}
        </dd>
        <dt className="text-muted-foreground">Cell offset</dt>
        <dd className="truncate text-right text-foreground">
          {formatCellOffset(atom.imageOffset)}
        </dd>
        {vectorInfo ? (
          <>
            <dt className="text-muted-foreground">Vector xyz</dt>
            <dd className="truncate text-right text-foreground">
              {formatAtomVectorForDisplay(vectorInfo.vector)}
            </dd>
            <dt className="text-muted-foreground">Vector |v|</dt>
            <dd className="truncate text-right text-foreground">
              {formatAtomVectorLengthForDisplay(vectorInfo.length)}
            </dd>
          </>
        ) : null}
      </dl>
    </aside>
  );
}
