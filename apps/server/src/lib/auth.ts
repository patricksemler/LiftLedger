// Verifies the dashboard's Supabase access token and exposes the user id.

import type { MiddlewareHandler } from "hono";
import { db } from "./db";

export type AuthVars = { Variables: { userId: string } };

export const requireUser: MiddlewareHandler<AuthVars> = async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "Not signed in" }, 401);
  const { data, error } = await db.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub || data.claims.role !== "authenticated") {
    return c.json({ error: "Session expired — sign in again" }, 401);
  }
  c.set("userId", sub);
  await next();
};
