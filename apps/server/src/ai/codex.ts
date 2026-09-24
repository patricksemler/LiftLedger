// A LanguageModel backed by the Codex CLI (`codex exec`), so a self-hosted
// LiftLedger can run on the ChatGPT subscription signed in to Codex on the
// server instead of a per-token API key.
//
// Each doGenerate is one `codex exec` run in an empty, read-only temp dir:
// - structured output  → `--output-schema` (strict JSON schema)
// - images             → `-i <file>`
// - tool calling       → emulated: Codex answers with a JSON envelope of
//   `tool_calls` (name + JSON-string arguments) or a final `text`; the AI SDK
//   runs our tools and calls again with the results in the transcript. Codex
//   never executes anything itself.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  JSONSchema7,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamResult,
  SharedV4Warning,
} from "@ai-sdk/provider";

export interface CodexOptions {
  /** Path to the codex binary. */
  bin?: string;
  /** model_reasoning_effort: low keeps "log my eggs" fast. */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  timeoutMs?: number;
}

const PREAMBLE = `You are being used as a plain language model by an application, not as a coding agent.
Do not run shell commands, read or write files, or browse. Answer only from the conversation below.`;

/** OpenAI strict structured outputs need every property required and
 * additionalProperties: false, recursively. */
export function strictify(schema: JSONSchema7): JSONSchema7 {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$schema" || k === "default") continue;
      out[k] = walk(v);
    }
    if (out.type === "object" || out.properties) {
      const props = (out.properties ?? {}) as Record<string, unknown>;
      out.properties = props;
      out.required = Object.keys(props);
      out.additionalProperties = false;
    }
    return out;
  };
  return walk(schema) as JSONSchema7;
}

function toolEnvelopeSchema(toolNames: string[]): JSONSchema7 {
  return {
    type: "object",
    properties: {
      tool_calls: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", enum: toolNames },
            arguments_json: {
              type: "string",
              description: "The tool's arguments as a JSON object string matching its input schema",
            },
          },
          required: ["name", "arguments_json"],
          additionalProperties: false,
        },
      },
      text: { type: ["string", "null"], description: "Your final reply, when not calling tools" },
    },
    required: ["tool_calls", "text"],
    additionalProperties: false,
  };
}

function stringifyOutput(output: unknown): string {
  const o = output as { type?: string; value?: unknown };
  if (o?.type === "text" || o?.type === "error-text") return String(o.value);
  if (o?.type === "json" || o?.type === "error-json") return JSON.stringify(o.value);
  return JSON.stringify(output);
}

interface Rendered {
  text: string;
  images: { data: Uint8Array; mediaType: string }[];
}

/** Flattens the AI SDK prompt into one transcript for `codex exec`. */
export function renderPrompt(prompt: LanguageModelV4Prompt): Rendered {
  const images: Rendered["images"] = [];
  const system: string[] = [];
  const turns: string[] = [];
  for (const m of prompt) {
    if (m.role === "system") {
      system.push(m.content);
      continue;
    }
    const lines: string[] = [];
    for (const part of m.content) {
      if (part.type === "text") lines.push(part.text);
      else if (part.type === "file" && part.mediaType.startsWith("image/")) {
        const d = part.data;
        if (d.type === "data") {
          images.push({
            data: typeof d.data === "string" ? Buffer.from(d.data, "base64") : d.data,
            mediaType: part.mediaType,
          });
          lines.push(`[image ${images.length} attached]`);
        }
      } else if (part.type === "tool-call") {
        lines.push(`[called tool ${part.toolName} with ${JSON.stringify(part.input)}]`);
      } else if (part.type === "tool-result") {
        lines.push(`[result of ${part.toolName}]: ${stringifyOutput(part.output)}`);
      }
    }
    if (lines.length > 0) turns.push(`### ${m.role}\n${lines.join("\n")}`);
  }
  const text = [
    PREAMBLE,
    system.length ? `## Instructions\n${system.join("\n\n")}` : "",
    `## Conversation\n${turns.join("\n\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { text, images };
}

function runCodex(
  bin: string,
  args: string[],
  stdin: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const kill = (why: string) => {
      child.kill("SIGKILL");
      reject(new Error(why));
    };
    const timer = setTimeout(
      () => kill(`codex exec timed out after ${timeoutMs / 1000}s`),
      timeoutMs,
    );
    signal?.addEventListener("abort", () => kill("aborted"), { once: true });
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Couldn't start codex (${e.message}). Is the Codex CLI installed?`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`codex exec exited ${code}: ${(stderr || stdout).trim().slice(-600)}`));
    });
    child.stdin.end(stdin);
  });
}

/** Token usage from `--json` events (turn.completed carries it). */
function usageFrom(stdout: string) {
  let input: number | undefined;
  let cached: number | undefined;
  let output: number | undefined;
  for (const line of stdout.split("\n")) {
    if (!line.includes("usage")) continue;
    try {
      const ev = JSON.parse(line) as {
        usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
      };
      if (ev.usage) {
        input = ev.usage.input_tokens;
        cached = ev.usage.cached_input_tokens;
        output = ev.usage.output_tokens;
      }
    } catch {
      // not an event line
    }
  }
  return {
    inputTokens: {
      total: input,
      noCache: input != null && cached != null ? input - cached : undefined,
      cacheRead: cached,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

export class CodexCliModel implements LanguageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "codex-cli";
  readonly supportedUrls = {};

  constructor(
    readonly modelId: string,
    private readonly opts: CodexOptions = {},
  ) {}

  async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    const warnings: SharedV4Warning[] = [];
    const tools = (options.tools ?? []).filter((t) => t.type === "function");
    const useTools = tools.length > 0 && options.toolChoice?.type !== "none";

    const rendered = renderPrompt(options.prompt);
    let prompt = rendered.text;
    let schema: JSONSchema7 | null = null;

    if (!useTools && options.responseFormat?.type !== "json") {
      prompt += "\n\nReply with plain text only — no JSON, no code fences.";
    }
    if (useTools) {
      const catalog = tools
        .map(
          (t) =>
            `- ${t.name}: ${t.description ?? ""}\n  input schema: ${JSON.stringify(t.inputSchema)}`,
        )
        .join("\n");
      const must =
        options.toolChoice?.type === "required" || options.toolChoice?.type === "tool"
          ? "You MUST call at least one tool now."
          : "Call tools when you need data; once you have what you need, return an empty tool_calls list and your reply in text.";
      prompt += `\n\n## Tools\n${catalog}\n\n${must} To call a tool, put it in tool_calls with arguments_json as a JSON object string, and set text to null.`;
      schema = toolEnvelopeSchema(tools.map((t) => t.name));
    } else if (options.responseFormat?.type === "json" && options.responseFormat.schema) {
      schema = strictify(options.responseFormat.schema);
    }

    const dir = await mkdtemp(join(tmpdir(), "liftledger-codex-"));
    try {
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--sandbox",
        "read-only",
        "--json",
        "-C",
        dir,
        "-c",
        `model_reasoning_effort="${this.opts.reasoningEffort ?? "low"}"`,
        "-o",
        join(dir, "out.txt"),
      ];
      if (this.modelId && this.modelId !== "default") args.push("-m", this.modelId);
      if (schema) {
        await writeFile(join(dir, "schema.json"), JSON.stringify(schema));
        args.push("--output-schema", join(dir, "schema.json"));
      }
      for (const [i, img] of rendered.images.entries()) {
        const ext = img.mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
        const file = join(dir, `image-${i}.${ext}`);
        await writeFile(file, img.data);
        args.push("-i", file);
      }
      args.push("-");

      const { stdout } = await runCodex(
        this.opts.bin ?? "codex",
        args,
        prompt,
        dir,
        this.opts.timeoutMs ?? 180_000,
        options.abortSignal,
      );
      const raw = (await readFile(join(dir, "out.txt"), "utf8")).trim();
      const usage = usageFrom(stdout);

      if (useTools) {
        const env = JSON.parse(raw) as {
          tool_calls: { name: string; arguments_json: string }[];
          text: string | null;
        };
        const content: LanguageModelV4Content[] = [];
        if (env.text) content.push({ type: "text", text: env.text });
        for (const [i, call] of env.tool_calls.entries()) {
          content.push({
            type: "tool-call",
            toolCallId: `codex-${Date.now()}-${i}`,
            toolName: call.name,
            input: call.arguments_json || "{}",
          });
        }
        const calledTools = env.tool_calls.length > 0;
        return {
          content,
          finishReason: { unified: calledTools ? "tool-calls" : "stop", raw: undefined },
          usage,
          warnings,
        };
      }

      return {
        content: [{ type: "text", text: raw }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async doStream(_options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
    throw new Error("Streaming isn't supported by the Codex CLI provider — use generateText.");
  }
}
