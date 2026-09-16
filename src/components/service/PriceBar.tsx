"use client";
import { amd } from "@/lib/format";

export function PriceBar({ price, strike, caption, action }: { price: number; strike?: number; caption?: string; action: React.ReactNode }) {
  return (
    <>
      <div className="h-24" />
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper">
        <div className="container-m flex items-center gap-3 pt-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold">{amd(price)}</span>
              {strike && strike > price ? <span className="text-sm text-muted line-through">{amd(strike)}</span> : null}
            </div>
            {caption && <div className="truncate text-xs text-muted">{caption}</div>}
          </div>
          {action}
        </div>
      </div>
    </>
  );
}
