// How a route asks for a Hevy sync, independent of where the server runs:
// the long-running Node server hands it to pg-boss (jobs/boss.ts), the Vercel
// function runs it in the background after responding (vercel.ts). Each entry
// point installs its dispatcher at startup.

type Dispatcher = (userId: string) => Promise<void>;

let dispatcher: Dispatcher | null = null;

export function setHevySyncDispatcher(fn: Dispatcher): void {
  dispatcher = fn;
}

export async function requestHevySync(userId: string): Promise<void> {
  if (!dispatcher) throw new Error("No Hevy sync dispatcher installed");
  await dispatcher(userId);
}
