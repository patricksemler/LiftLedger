import type { AiProviderKind } from "@liftledger/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { relativeTime } from "../../lib/format";
import {
  type IntegrationRow,
  profileQueryKeys,
  useIntegration,
  useTelegramLink,
} from "../../lib/profile";
import { subscribeAndInvalidate } from "../../lib/queries";
import { supabase } from "../../lib/supabase";
import {
  useAppleHealthToken,
  useConnectAi,
  useConnectHevy,
  useDisconnect,
  useTelegramLinkCode,
} from "./connectionsQueries";

const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-accent";
const primaryButton =
  "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40";
const secondaryButton =
  "rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3 disabled:opacity-40";

function StatusPill({ integration }: { integration: IntegrationRow | null }) {
  if (!integration) return <span className="text-[11px] text-ink-faint">Not connected</span>;
  if (integration.status === "error")
    return <span className="text-[11px] text-negative">Error</span>;
  return (
    <span className="flex items-center gap-1 text-[11px] text-positive">
      <Check className="size-3" /> Connected
    </span>
  );
}

function ConnectionCard(props: {
  title: string;
  subtitle: string;
  integration: IntegrationRow | null;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">
            {props.title}
            {props.required && <span className="ml-2 text-[11px] text-accent">required</span>}
          </h3>
          <p className="text-xs text-ink-faint">{props.subtitle}</p>
        </div>
        <StatusPill integration={props.integration} />
      </div>
      {props.integration?.last_error && (
        <p className="text-xs text-negative">{props.integration.last_error}</p>
      )}
      {props.children}
    </Card>
  );
}

export function HevyConnection({ onConnected }: { onConnected?: () => void }) {
  const integration = useIntegration("hevy");
  const connect = useConnectHevy();
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState(!integration);

  async function submit() {
    await connect.mutateAsync(key.trim());
    setKey("");
    setEditing(false);
    onConnected?.();
  }

  return (
    <ConnectionCard
      title="Hevy"
      subtitle="Your workouts, exercises and weigh-ins. Needs Hevy Pro."
      integration={integration}
      required
    >
      {integration && !editing ? (
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs text-ink-dim">
            key •••• {integration.secret_last4}
            {integration.last_sync_at && ` · synced ${relativeTime(integration.last_sync_at)}`}
          </p>
          <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
            Replace key
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-dim">
            Get your API key at{" "}
            <a
              href="https://hevy.com/settings?developer"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-accent"
            >
              hevy.com/settings → Developer <ExternalLink className="size-3" />
            </a>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              placeholder="Hevy API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className={`${inputClass} font-mono`}
            />
            <button
              type="button"
              className={primaryButton}
              disabled={key.trim().length < 10 || connect.isPending}
              onClick={() => void submit()}
            >
              {connect.isPending ? "Checking…" : "Connect"}
            </button>
          </div>
          {connect.isError && <p className="text-xs text-negative">{connect.error.message}</p>}
          {connect.data && (
            <p className="text-xs text-positive">
              Connected — found {connect.data.workoutCount} workouts. Importing in the background.
            </p>
          )}
        </>
      )}
    </ConnectionCard>
  );
}

const AI_PRESETS: Record<AiProviderKind, { label: string; model: string; baseUrl?: string }> = {
  anthropic: { label: "Anthropic (Claude)", model: "claude-sonnet-5" },
  openai: { label: "OpenAI", model: "gpt-5" },
  openai_compatible: {
    label: "Local / OpenAI-compatible URL",
    model: "llama3.2-vision",
    baseUrl: "http://localhost:11434/v1",
  },
};

export function AiConnection() {
  const integration = useIntegration("ai");
  const connect = useConnectAi();
  const disconnect = useDisconnect("ai");
  const config = (integration?.config ?? {}) as {
    kind?: AiProviderKind;
    model?: string;
    base_url?: string;
    supports_vision?: boolean;
    supports_tools?: boolean;
  };
  const [editing, setEditing] = useState(!integration);
  const [kind, setKind] = useState<AiProviderKind>(config.kind ?? "anthropic");
  const [model, setModel] = useState(config.model ?? AI_PRESETS.anthropic.model);
  const [baseUrl, setBaseUrl] = useState(config.base_url ?? "");
  const [apiKey, setApiKey] = useState("");

  function chooseKind(k: AiProviderKind) {
    setKind(k);
    setModel(AI_PRESETS[k].model);
    setBaseUrl(AI_PRESETS[k].baseUrl ?? "");
  }

  async function submit() {
    await connect.mutateAsync({
      kind,
      model: model.trim(),
      baseUrl: kind === "openai_compatible" ? baseUrl.trim() : undefined,
      apiKey: apiKey.trim() || undefined,
    });
    setApiKey("");
    setEditing(false);
  }

  const needsKey = kind !== "openai_compatible";

  return (
    <ConnectionCard
      title="AI model"
      subtitle="Powers the Telegram bot: reading meals and answering questions. Bring your own key or a local model."
      integration={integration}
    >
      {integration && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs text-ink-dim">
            {AI_PRESETS[config.kind ?? "anthropic"].label} · {config.model}
            {config.base_url && ` · ${config.base_url}`}
            <br />
            tools {config.supports_tools ? "✓" : "✗"} · images {config.supports_vision ? "✓" : "✗"}
          </p>
          <div className="flex gap-2">
            <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
              Change
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <select
            aria-label="Provider"
            value={kind}
            onChange={(e) => chooseKind(e.target.value as AiProviderKind)}
            className={inputClass}
          >
            {(Object.keys(AI_PRESETS) as AiProviderKind[]).map((k) => (
              <option key={k} value={k}>
                {AI_PRESETS[k].label}
              </option>
            ))}
          </select>
          {kind === "openai_compatible" && (
            <input
              placeholder="Base URL, e.g. http://localhost:11434/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          )}
          <input
            placeholder="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={`${inputClass} font-mono`}
          />
          <input
            type="password"
            autoComplete="off"
            placeholder={needsKey ? "API key" : "API key (if your server needs one)"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className={`${inputClass} font-mono`}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={
                !model.trim() ||
                (needsKey && !apiKey.trim()) ||
                (kind === "openai_compatible" && !baseUrl.trim()) ||
                connect.isPending
              }
              onClick={() => void submit()}
            >
              {connect.isPending ? "Testing…" : "Test & save"}
            </button>
            {integration && (
              <button type="button" className={secondaryButton} onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
          {connect.isError && <p className="text-xs text-negative">{connect.error.message}</p>}
        </div>
      )}
    </ConnectionCard>
  );
}

export function TelegramConnection() {
  const queryClient = useQueryClient();
  const { data: link } = useTelegramLink();
  const ai = useIntegration("ai");
  const linkCode = useTelegramLinkCode();

  useEffect(
    () =>
      subscribeAndInvalidate({ table: "telegram_links", queryKey: profileQueryKeys.telegramLink }),
    [],
  );

  async function unlink() {
    if (!link) return;
    await supabase.from("telegram_links").delete().eq("user_id", link.user_id);
    void queryClient.invalidateQueries({ queryKey: profileQueryKeys.telegramLink });
  }

  const pseudoIntegration = link
    ? ({ status: "connected", last_error: null } as IntegrationRow)
    : null;

  return (
    <ConnectionCard
      title="Telegram"
      subtitle="Text or photograph a meal to log it; ask about your training and nutrition."
      integration={pseudoIntegration}
    >
      {link ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-dim">
            Linked{link.tg_username ? ` to @${link.tg_username}` : ""} on{" "}
            {new Date(link.linked_at).toLocaleDateString()}
          </p>
          <button type="button" className={secondaryButton} onClick={() => void unlink()}>
            Unlink
          </button>
        </div>
      ) : linkCode.data ? (
        <div className="flex flex-col gap-2">
          <a
            href={linkCode.data.url}
            target="_blank"
            rel="noreferrer"
            className={`${primaryButton} inline-flex w-fit items-center gap-1.5`}
          >
            Open Telegram <ExternalLink className="size-3.5" />
          </a>
          <p className="text-xs text-ink-faint">
            Tap Start in the chat. This link works once and expires{" "}
            {relativeTime(linkCode.data.expiresAt)}. This card updates when you're linked.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={`${primaryButton} w-fit`}
            onClick={() => linkCode.mutate()}
            disabled={linkCode.isPending}
          >
            {linkCode.isPending ? "Creating link…" : "Connect Telegram"}
          </button>
          {!ai && (
            <p className="text-xs text-ink-faint">
              Connect an AI model too — without one the bot can only show /today and /week.
            </p>
          )}
          {linkCode.isError && <p className="text-xs text-negative">{linkCode.error.message}</p>}
        </div>
      )}
    </ConnectionCard>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-0 px-2 py-1.5 font-mono text-xs text-ink">
          {value}
        </code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className={secondaryButton}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function AppleHealthConnection() {
  const integration = useIntegration("apple_health");
  const token = useAppleHealthToken();
  const disconnect = useDisconnect("apple_health");

  return (
    <ConnectionCard
      title="Apple Health"
      subtitle="Steps, active & resting energy and weigh-ins, via the Health Auto Export iOS app."
      integration={integration}
    >
      {token.data ? (
        <div className="flex flex-col gap-3">
          <CopyField label="URL" value={token.data.url} />
          <CopyField label="Header: Authorization" value={`Bearer ${token.data.token}`} />
          <ol className="list-decimal space-y-1 pl-4 text-xs text-ink-dim">
            <li>
              Install <span className="text-ink">Health Auto Export – JSON+CSV</span> on your
              iPhone.
            </li>
            <li>Automations → New → REST API. Paste the URL above.</li>
            <li>
              Add Header <span className="font-mono">Authorization</span> with the value above.
            </li>
            <li>
              Data type: Health Metrics — pick Step Count, Active Energy, Resting Energy, Weight &
              Body Fat Percentage.
            </li>
            <li>
              Format JSON, Export Version 2, Summarize Data on, Time Grouping: Day, Date Range:
              Since Last Sync, Batch Requests on.
            </li>
            <li>Tap "Manual Export" once to send your history.</li>
          </ol>
          <p className="text-[11px] text-ink-faint">
            The token is shown only now. Generating a new one disconnects the old one.
          </p>
        </div>
      ) : integration ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-dim">
            {integration.last_sync_at
              ? `Last data received ${relativeTime(integration.last_sync_at)}`
              : "Waiting for the first export from your phone…"}
          </p>
          <div className="flex gap-2">
            <button type="button" className={secondaryButton} onClick={() => token.mutate()}>
              New token
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`${primaryButton} w-fit`}
          onClick={() => token.mutate()}
          disabled={token.isPending}
        >
          {token.isPending ? "Generating…" : "Set up Apple Health"}
        </button>
      )}
      {token.isError && <p className="text-xs text-negative">{token.error.message}</p>}
    </ConnectionCard>
  );
}

export function ConnectionsPanel() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeAndInvalidate({
        table: "integrations",
        queryKey: profileQueryKeys.integrations,
        onChange: () =>
          void queryClient.invalidateQueries({ queryKey: profileQueryKeys.integrations }),
      }),
    [queryClient],
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <HevyConnection />
      <AiConnection />
      <TelegramConnection />
      <AppleHealthConnection />
    </div>
  );
}
