"use client";
import { useRouter } from "@/i18n/navigation";

export function DateJump({ value, base }: { value: string; base: string }) {
  const router = useRouter();
  return <input type="date" value={value} className="input min-h-9 w-auto py-1" onChange={(e) => e.target.value && router.push(`${base}?date=${e.target.value}`)} />;
}
