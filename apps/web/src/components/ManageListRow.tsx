import { Check, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import type { ReactNode } from "react";

interface ManageListRowProps {
  /** Subject of the reorder/edit/confirm aria-labels (e.g. a routine or topic name). */
  label: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reorderDisabled?: boolean;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  savePending?: boolean;
  confirming: boolean;
  /** Inline prompt shown next to Yes/Cancel, e.g. "Archive?" / "Delete?". */
  confirmPrompt: string;
  /** Verb used in the destructive button's aria-label, e.g. "Archive" / "Delete". */
  confirmActionLabel: string;
  onRequestConfirm: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  confirmPending?: boolean;
  destructiveIcon: ReactNode;
  /** Extra icon-buttons shown before edit/delete in the idle state (e.g. brief
   * topics' pause/resume toggle) — routines have none. */
  extraActions?: ReactNode;
  /** The row's own content — a display view or edit-mode fields, entirely
   * caller-controlled since routines and topics don't share field shapes. */
  children: ReactNode;
}

/** Shared row chrome — reorder chevrons, edit/save/cancel, and a
 * confirm-then-act destructive button — for the dashboard's direct-CRUD
 * manage lists (routines, brief topics). Previously two near-identical
 * ~90-line copies (REFACTOR_PLAN.md Phase 6 step 4); only the middle content
 * (name/description fields, schedule picker, pause/resume) differs per list. */
export function ManageListRow({
  label,
  onMoveUp,
  onMoveDown,
  reorderDisabled,
  editing,
  onEdit,
  onSave,
  onCancel,
  savePending,
  confirming,
  confirmPrompt,
  confirmActionLabel,
  onRequestConfirm,
  onConfirm,
  onCancelConfirm,
  confirmPending,
  destructiveIcon,
  extraActions,
  children,
}: ManageListRowProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex flex-col">
        <button
          type="button"
          disabled={!onMoveUp || reorderDisabled}
          onClick={onMoveUp}
          aria-label={`Move ${label} up`}
          className="text-ink-faint hover:text-ink disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={!onMoveDown || reorderDisabled}
          onClick={onMoveDown}
          aria-label={`Move ${label} down`}
          className="text-ink-faint hover:text-ink disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      <div className="min-w-0 flex-1">{children}</div>

      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <>
            <button
              type="button"
              onClick={onSave}
              disabled={savePending}
              aria-label="Save"
              className="rounded-md p-1.5 text-positive hover:bg-surface-2"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel"
              className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          </>
        ) : confirming ? (
          <>
            <span className="text-xs text-ink-dim">{confirmPrompt}</span>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmPending}
              className="rounded-md bg-negative-dim px-2 py-1 text-xs text-negative hover:opacity-80"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={onCancelConfirm}
              className="rounded-md px-2 py-1 text-xs text-ink-faint hover:text-ink"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {extraActions}
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${label}`}
              className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onRequestConfirm}
              aria-label={`${confirmActionLabel} ${label}`}
              className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-negative"
            >
              {destructiveIcon}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
