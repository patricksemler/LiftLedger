import { waitUntil } from "@vercel/functions";

/** Runs work after the response has gone out. On Vercel, `waitUntil` keeps
 * the function alive until the promise settles; on the long-running Node
 * server it's a no-op and the promise simply runs in-process. Errors are
 * logged here because nobody is left awaiting them. */
export function background(label: string, work: Promise<unknown>): void {
  waitUntil(work.catch((e) => console.error(`[${label}]`, e)));
}
