// The shared LiftLedger Telegram bot. Users link their account with a
// one-time deep link from Settings (t.me/<bot>?start=<code>); after that,
// every message is routed to food logging or Q&A for that user.

import { Bot, type Context, InlineKeyboard } from "grammy";
import { env } from "../env";
import { sha256 } from "../lib/crypto";
import { db, maybe, must, ok } from "../lib/db";
import { loadUserContext } from "./context";
import { getMeal, mealSummary, scaleMeal } from "./food/pipeline";
import { esc, todayLine, totalsLine } from "./format";
import { respond } from "./respond";

export const bot = env.TELEGRAM_BOT_TOKEN ? new Bot(env.TELEGRAM_BOT_TOKEN) : null;

const HELP = `Send me what you ate — a photo, or text like “3 servings of HEB granola” or “1 cup black beans, 220 kcal”. I'll log it to your LiftLedger dashboard (photos aren't stored).

Ask me things like:
• How have my biceps progressed over 6 weeks?
• Have I been hitting my calorie goal? What am I overeating on?
• What did I weigh in Hevy yesterday?

/today — today's totals · /week — last 7 days · /unlink — disconnect`;

const mealKeyboard = (mealId: string) =>
  new InlineKeyboard()
    .text("↩️ Undo", `undo:${mealId}`)
    .text("×2", `x2:${mealId}`)
    .text("✏️ Edit", `edit:${mealId}`);

async function linkedUser(chatId: number): Promise<string | null> {
  const row = maybe(
    await db.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle(),
  );
  return row?.user_id ?? null;
}

async function requireLinked(ctx: Context): Promise<string | null> {
  const chatId = ctx.chat?.id;
  if (!chatId) return null;
  const userId = await linkedUser(chatId);
  if (!userId) {
    await ctx.reply(
      "This chat isn't linked to a LiftLedger account yet. Open LiftLedger → Settings → Connections → Connect Telegram.",
    );
  }
  return userId;
}

async function withTyping<T>(ctx: Context, work: () => Promise<T>): Promise<T> {
  const send = () => ctx.replyWithChatAction("typing").catch(() => {});
  await send();
  const timer = setInterval(send, 4500);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

async function downloadPhoto(ctx: Context): Promise<Uint8Array | null> {
  const sizes = ctx.message?.photo;
  if (!sizes || sizes.length === 0 || !bot) return null;
  // Largest size under ~1.5 MB keeps vision calls fast.
  const pick =
    [...sizes].reverse().find((s) => (s.file_size ?? 0) < 1_500_000) ?? sizes[sizes.length - 1];
  if (!pick) return null;
  const file = await ctx.api.getFile(pick.file_id);
  if (!file.file_path) return null;
  const res = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
  );
  if (!res.ok) return null;
  // Held in memory for this request only — never written anywhere.
  return new Uint8Array(await res.arrayBuffer());
}

async function totalsReply(userId: string, days: number): Promise<string> {
  const uctx = await loadUserContext(userId);
  if (days === 1) {
    return [
      `<b>Today</b> · ${uctx.todayTotals.meals} meals`,
      totalsLine(uctx.todayTotals),
      todayLine(uctx),
    ].join("\n");
  }
  const from = new Date(`${uctx.today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const fromDate = from.toISOString().slice(0, 10);
  const rows = must(
    await db
      .from("daily_nutrition")
      .select("date, calories, protein_g, goal_calories")
      .eq("user_id", userId)
      .gte("date", fromDate)
      .order("date"),
  );
  if (rows.length === 0) return "Nothing logged in the last 7 days.";
  const lines = rows.map((r) => {
    const mark = r.goal_calories
      ? Math.abs((r.calories ?? 0) / r.goal_calories - 1) <= 0.1
        ? "✅"
        : (r.calories ?? 0) > r.goal_calories
          ? "🔺"
          : "🔻"
      : "·";
    return `${mark} ${r.date?.slice(5)}  ${Math.round(r.calories ?? 0)} kcal · ${Math.round(r.protein_g ?? 0)} g P`;
  });
  const avg = Math.round(rows.reduce((a, r) => a + (r.calories ?? 0), 0) / rows.length);
  return [
    `<b>Last ${days} days</b> (avg ${avg} kcal on ${rows.length} logged days)`,
    ...lines,
  ].join("\n");
}

async function handleMessage(ctx: Context, text: string | null, withPhoto: boolean) {
  const userId = await requireLinked(ctx);
  if (!userId) return;
  await withTyping(ctx, async () => {
    const image = withPhoto ? await downloadPhoto(ctx) : null;
    const reply = await respond(userId, { text, image, hasPhoto: withPhoto });
    await ctx
      .reply(reply.text, {
        parse_mode: reply.format,
        reply_markup: reply.mealId ? mealKeyboard(reply.mealId) : undefined,
      })
      // Model-written Markdown can be malformed; fall back to plain text.
      .catch(() => ctx.reply(reply.text));
  });
}

if (bot) {
  bot.command("start", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) {
      const linked = await linkedUser(ctx.chat.id);
      await ctx.reply(
        linked
          ? HELP
          : "Hi! Link your LiftLedger account from Settings → Connections → Connect Telegram, then I can log your meals.",
      );
      return;
    }
    const row = maybe(
      await db
        .from("telegram_link_codes")
        .select("user_id, expires_at, used_at")
        .eq("code_hash", sha256(code))
        .maybeSingle(),
    );
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      await ctx.reply(
        "That link has expired. Make a new one in LiftLedger → Settings → Connections.",
      );
      return;
    }
    // One chat per account and one account per chat.
    ok(
      await db
        .from("telegram_links")
        .delete()
        .or(`user_id.eq.${row.user_id},chat_id.eq.${ctx.chat.id}`),
    );
    ok(
      await db.from("telegram_links").insert({
        user_id: row.user_id,
        chat_id: ctx.chat.id,
        tg_user_id: ctx.from?.id ?? ctx.chat.id,
        tg_username: ctx.from?.username ?? null,
      }),
    );
    ok(
      await db
        .from("telegram_link_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("code_hash", sha256(code)),
    );
    await ctx.reply(`✅ Linked! ${HELP}`);
  });

  bot.command("help", (ctx) => ctx.reply(HELP));

  bot.command("unlink", async (ctx) => {
    ok(await db.from("telegram_links").delete().eq("chat_id", ctx.chat.id));
    await ctx.reply("Unlinked. Your data stays in LiftLedger; link again any time from Settings.");
  });

  bot.command("today", async (ctx) => {
    const userId = await requireLinked(ctx);
    if (userId) await ctx.reply(await totalsReply(userId, 1), { parse_mode: "HTML" });
  });

  bot.command("week", async (ctx) => {
    const userId = await requireLinked(ctx);
    if (userId) await ctx.reply(await totalsReply(userId, 7), { parse_mode: "HTML" });
  });

  bot.on("message:photo", (ctx) => handleMessage(ctx, ctx.message.caption ?? null, true));
  bot.on("message:text", (ctx) => handleMessage(ctx, ctx.message.text, false));

  bot.on("callback_query:data", async (ctx) => {
    const [action, mealId] = ctx.callbackQuery.data.split(":");
    const chatId = ctx.chat?.id;
    const userId = chatId ? await linkedUser(chatId) : null;
    if (!userId || !mealId) return ctx.answerCallbackQuery();
    const meal = await getMeal(userId, mealId);
    if (!meal) return ctx.answerCallbackQuery({ text: "That meal is already gone." });

    if (action === "undo") {
      ok(await db.from("meals").delete().eq("id", meal.id).eq("user_id", userId));
      await ctx.answerCallbackQuery({ text: "Removed" });
      await ctx.editMessageText(`↩️ Removed <s>${esc(meal.title)}</s>`, { parse_mode: "HTML" });
    } else if (action === "x2") {
      await scaleMeal(userId, meal, 2);
      const updated = await getMeal(userId, meal.id);
      await ctx.answerCallbackQuery({ text: "Doubled" });
      if (updated)
        await ctx.editMessageText(`✏️ Doubled\n${mealSummary(updated)}`, {
          parse_mode: "HTML",
          reply_markup: mealKeyboard(meal.id),
        });
    } else if (action === "edit") {
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `What should change in “${meal.title}”? e.g. “only half the rice”, “remove the milk”, “the bar was 210 kcal”.`,
      );
    }
  });

  bot.catch((err) => {
    console.error("[bot]", err.error);
    err.ctx
      .reply("Sorry — something went wrong on my side. Try again in a moment.")
      .catch(() => {});
  });
}

export async function startBot(): Promise<void> {
  if (!bot || env.TELEGRAM_MODE === "off") {
    console.log("[bot] Telegram disabled (no TELEGRAM_BOT_TOKEN or TELEGRAM_MODE=off)");
    return;
  }
  await bot.api.setMyCommands([
    { command: "today", description: "Today's calories and protein" },
    { command: "week", description: "The last 7 days" },
    { command: "help", description: "What I can do" },
    { command: "unlink", description: "Disconnect this chat" },
  ]);
  if (env.TELEGRAM_MODE === "webhook") {
    await bot.api.setWebhook(`${env.PUBLIC_BASE_URL}/telegram/webhook`, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    });
    console.log("[bot] webhook mode");
  } else {
    await bot.api.deleteWebhook();
    void bot.start({ onStart: (me) => console.log(`[bot] polling as @${me.username}`) });
  }
}
