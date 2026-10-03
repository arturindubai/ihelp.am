import { notFound } from "next/navigation";

/** Catch-all: любой неизвестный путь внутри (site) → 404 с шапкой и подвалом сайта */
export default function CatchAll() {
  notFound();
}
