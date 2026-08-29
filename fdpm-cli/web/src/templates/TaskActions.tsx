/**
 * Task action menu — kebab button + native <dialog> for confirmation.
 *
 * Each action POSTs to /api/planning/<verb> via api.planning.runVerb,
 * which the bridge routes to `fdpm planning <verb>`. On success, calls
 * `onRefresh()` so the workbook re-renders with the new state.
 *
 * Legality is checked client-side from data the page already has — no
 * extra round trips:
 *   - "Done" disabled when no plan:Verifies edge from this task.
 *   - "Release claim" disabled when no claim_holder_id is set.
 *   - The current status is greyed (e.g., "Ready" disabled when status
 *     is already Ready).
 *
 * The strict-by-default rules in the planning SDK still fire on the
 * server. The client-side gate is a UX nicety, not a security check.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { api, type PlanningVerb } from "../api";
import type { Primitive, Relation, WorkbookDetailResponse } from "../types";

interface Props {
  task: Primitive;
  data: WorkbookDetailResponse;
  onRefresh: () => Promise<void> | void;
}

interface Verb {
  id: PlanningVerb;
  label: string;
  /** Confirmation copy. If absent, run the action directly. */
  confirm?: string;
}

const VERBS: Verb[] = [
  { id: "mark-ready", label: "Mark Ready" },
  { id: "mark-in-progress", label: "Mark In Progress" },
  { id: "mark-in-review", label: "Mark In Review" },
  { id: "mark-done", label: "Mark Done" },
  {
    id: "mark-cancelled",
    label: "Cancel task",
    confirm:
      "Cancel this task? Status becomes Cancelled (terminal). This is recorded in the op log; recovery requires another op.",
  },
  {
    id: "release-claim",
    label: "Release claim",
    confirm: "Release the current claim on this task? The lease will be cleared.",
  },
];

/** Map a verb to the task status it sets — used to grey out "you're already there". */
const VERB_TARGET_STATUS: Partial<Record<PlanningVerb, string>> = {
  "mark-ready": "Ready",
  "mark-in-progress": "In_progress",
  "mark-in-review": "In_review",
  "mark-done": "Done",
  "mark-cancelled": "Cancelled",
};

function relSrc(r: Relation): string | undefined {
  return r.source_id ?? r.src_id;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function listRelations(data: WorkbookDetailResponse): Relation[] {
  if (Array.isArray(data.relations)) return data.relations;
  if (data.relations) return Object.values(data.relations);
  return [];
}

/**
 * Decide whether a verb is permitted from the current task state. Returns
 * null when permitted; returns a one-line reason when not. The reason is
 * shown as the tooltip on the disabled menu item.
 */
function disabledReason(
  verb: PlanningVerb,
  task: Primitive,
  data: WorkbookDetailResponse,
): string | null {
  const status = asString(task.field_values["status"]);
  const targetStatus = VERB_TARGET_STATUS[verb];
  if (targetStatus && status === targetStatus) {
    return `Already ${targetStatus}`;
  }
  if (verb === "mark-done") {
    const hasVerifies = listRelations(data).some(
      (r) => r.type_id === "plan:Verifies" && relSrc(r) === task.id,
    );
    if (!hasVerifies) {
      return "No plan:Verifies edge — needs an AcceptanceCriterion first";
    }
  }
  if (verb === "release-claim") {
    if (task.field_values["claim_holder_id"] == null) {
      return "No claim to release";
    }
  }
  return null;
}

export function TaskActions({ task, data, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PlanningVerb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Verb | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dialogTitleId = `task-actions-dialog-${task.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  // Close menu on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current.find((item) => item && !item.disabled)?.focus();
  }, [open]);

  // Open dialog when a confirmation-required verb is staged.
  useEffect(() => {
    if (pending && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [pending]);

  const workbook = data.workbook.id;

  async function execute(verb: PlanningVerb) {
    setBusy(verb);
    setError(null);
    try {
      await api.planning.runVerb(verb, { workbook, taskId: task.id });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function handlePick(verb: Verb) {
    setOpen(false);
    if (verb.confirm) {
      setPending(verb);
    } else {
      void execute(verb.id);
    }
  }

  function handleDialogClose(e: SyntheticEvent<HTMLDialogElement>) {
    const dialog = e.currentTarget;
    const confirmed = dialog.returnValue === "confirm";
    const verb = pending;
    setPending(null);
    if (confirmed && verb) void execute(verb.id);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => Boolean(item && !item.disabled),
    );
    const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % enabledItems.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = enabledItems.length - 1;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (nextIndex != null && enabledItems[nextIndex]) {
      event.preventDefault();
      enabledItems[nextIndex].focus();
    }
  }

  return (
    <div className="task-actions" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        className="task-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Task actions"
        disabled={busy != null}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? "…" : "⋯"}
      </button>
      {open && (
        <div className="task-actions-menu" role="menu" onKeyDown={handleMenuKeyDown}>
          {VERBS.map((v, index) => {
            const reason = disabledReason(v.id, task, data);
            return (
              <button
                key={v.id}
                ref={(element) => { itemRefs.current[index] = element; }}
                type="button"
                role="menuitem"
                className="task-actions-item"
                disabled={reason != null}
                title={reason ?? ""}
                onClick={() => handlePick(v)}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <div className="task-actions-error" role="alert">
          <span>{error}</span>
          <button type="button" className="task-actions-error-dismiss" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="task-actions-dialog"
        aria-labelledby={dialogTitleId}
        onClose={handleDialogClose}
      >
        {pending && (
          <form method="dialog">
            <h4 className="task-actions-dialog-title" id={dialogTitleId}>{pending.label}</h4>
            <p className="task-actions-dialog-body">{pending.confirm}</p>
            <p className="task-actions-dialog-target">
              <code>{task.id}</code> in <code>{workbook}</code>
            </p>
            <div className="task-actions-dialog-buttons">
              <button type="submit" value="cancel">Cancel</button>
              <button type="submit" value="confirm" className="task-actions-dialog-primary">
                Confirm
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
