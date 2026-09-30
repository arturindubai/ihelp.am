"use client";
import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { writeCart, clearCart } from "@/lib/cart";
import { removeFromCartAction } from "@/server/actions/cart";

type Props = {
  cartItemId: string;
  serviceId: string;
  qty: number;
};

export function CartItemCounter({ cartItemId, qty }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      const entry = await removeFromCartAction(cartItemId);
      if (entry) writeCart(entry);
      else clearCart();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 border border-line rounded-xl px-2 py-1.5">
      <button
        onClick={handleRemove}
        disabled={pending}
        className="size-7 rounded-lg bg-surface flex items-center justify-center text-lg leading-none font-semibold text-ink hover:bg-line transition disabled:opacity-60"
        aria-label="−"
      >
        −
      </button>
      <span className="min-w-[20px] text-center font-semibold text-sm">{qty}</span>
      <button
        disabled
        className="size-7 rounded-lg bg-surface flex items-center justify-center text-lg leading-none font-semibold text-ink opacity-30 cursor-default"
        aria-label="+"
      >
        +
      </button>
    </div>
  );
}
