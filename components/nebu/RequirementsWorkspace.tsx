"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AssignmentRequirementV1 } from "@/lib/contracts/nebu/v1";
import {
  buildRequirementsViewModel,
  type RequirementsViewModel,
} from "@/lib/assignments/view-model";
import {
  getRequirementKindLabel,
  RequirementCard,
} from "@/components/nebu/RequirementCard";

const LEFT_COLLAPSED_KEY = "nebu:v1:workspace:left-collapsed";
const RIGHT_COLLAPSED_KEY = "nebu:v1:workspace:right-collapsed";

interface RequirementsWorkspaceProps {
  assignmentTitle: string;
  courseLabel: string;
  briefText: string;
  requirements: AssignmentRequirementV1[];
  rubricAvailable: boolean;
  statusPanel: React.ReactNode;
}

function usePersistedCollapsed(key: string) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(key) === "true");
  }, [key]);

  function update(value: boolean) {
    setCollapsed(value);
    window.localStorage.setItem(key, String(value));
  }

  return [collapsed, update] as const;
}

function groupByKind(items: AssignmentRequirementV1[]) {
  const groups = new Map<
    AssignmentRequirementV1["kind"],
    AssignmentRequirementV1[]
  >();
  for (const item of items) {
    groups.set(item.kind, [...(groups.get(item.kind) ?? []), item]);
  }
  return Array.from(groups.entries());
}

function TrustedPanel({
  view,
  collapsed,
  onToggle,
}: {
  view: RequirementsViewModel;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <aside className="hidden lg:block">
        <button
          type="button"
          onClick={onToggle}
          className="sticky top-4 rounded-xl border border-line bg-paper px-2 py-3 text-ink-muted hover:text-ink"
          title="Show trusted context"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="rounded-2xl border border-line bg-paper p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow text-accent">Trusted context</div>
          <h2 className="mt-1 font-serif text-[20px] tracking-tightish">
            Confirmed insights
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="hidden rounded-md p-1 text-ink-faint hover:bg-paper-sunken hover:text-ink lg:inline-flex"
          title="Collapse trusted context"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {view.trustedContext.length === 0 ? (
        <p className="mt-4 text-[13px] leading-6 text-ink-muted">
          Confirm Nebu&rsquo;s proposals to build trusted assignment context.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {view.trustedContext.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-line bg-paper-raised p-3"
            >
              <div className="text-[11px] font-medium uppercase tracking-eyebrow text-ink-faint">
                {getRequirementKindLabel(item.kind)}
              </div>
              <p className="mt-1 text-[13px] leading-5 text-ink">{item.text}</p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function NebuPanel({
  collapsed,
  onToggle,
  statusPanel,
  rejectedCount,
}: {
  collapsed: boolean;
  onToggle: () => void;
  statusPanel: React.ReactNode;
  rejectedCount: number;
}) {
  if (collapsed) {
    return (
      <aside className="hidden lg:block">
        <button
          type="button"
          onClick={onToggle}
          className="sticky top-4 rounded-xl border border-line bg-paper px-2 py-3 text-ink-muted hover:text-ink"
          title="Show Nebu panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="rounded-2xl border border-line bg-paper p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow text-accent">Nebu</div>
          <h2 className="mt-1 font-serif text-[20px] tracking-tightish">
            Reading guide
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="hidden rounded-md p-1 text-ink-faint hover:bg-paper-sunken hover:text-ink lg:inline-flex"
          title="Collapse Nebu panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4 text-[13px] leading-6 text-ink-muted">
        {statusPanel}
        <div className="rounded-xl border border-line bg-paper-raised p-3">
          <div className="font-medium text-ink">Required</div>
          <p className="mt-1">
            Nebu found an exact quote in the brief. Treat it as source-backed
            only after you confirm it.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-paper-raised p-3">
          <div className="font-medium text-ink">Inference</div>
          <p className="mt-1">
            Nebu is interpreting ambiguity. Use it as a prompt to clarify, not
            as professor-approved context.
          </p>
        </div>
        {rejectedCount > 0 && (
          <p className="text-[12px] text-ink-faint">
            {rejectedCount} rejected item{rejectedCount === 1 ? "" : "s"} kept
            out of active context.
          </p>
        )}
      </div>
    </aside>
  );
}

export function RequirementsWorkspace({
  assignmentTitle,
  courseLabel,
  briefText,
  requirements,
  rubricAvailable,
  statusPanel,
}: RequirementsWorkspaceProps) {
  const [leftCollapsed, setLeftCollapsed] =
    usePersistedCollapsed(LEFT_COLLAPSED_KEY);
  const [rightCollapsed, setRightCollapsed] =
    usePersistedCollapsed(RIGHT_COLLAPSED_KEY);
  const view = useMemo(
    () => buildRequirementsViewModel(requirements, rubricAvailable),
    [requirements, rubricAvailable],
  );
  const gridClass = leftCollapsed
    ? rightCollapsed
      ? "lg:grid-cols-[44px_minmax(0,1fr)_44px]"
      : "lg:grid-cols-[44px_minmax(0,1fr)_minmax(220px,300px)]"
    : rightCollapsed
      ? "lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_44px]"
      : "lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(220px,300px)]";

  return (
    <div
      className={`grid gap-4 ${gridClass}`}
      data-left-collapsed={leftCollapsed}
      data-right-collapsed={rightCollapsed}
    >
      <TrustedPanel
        view={view}
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed(!leftCollapsed)}
      />

      <main className="min-w-0 rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <div className="eyebrow text-accent">{courseLabel}</div>
        <h1 className="mt-1 font-serif text-[28px] sm:text-[36px] tracking-tightish leading-tight">
          Assignment Understanding
        </h1>
        <p className="mt-1 text-[14px] text-ink-muted">{assignmentTitle}</p>

        {view.contextNotice && (
          <div className="mt-5 rounded-xl border border-accent/30 bg-accent-soft/40 px-4 py-3 text-[13px] leading-6 text-accent-ink">
            {view.contextNotice}
          </div>
        )}

        <section className="mt-6">
          <h2 className="font-serif text-[22px] tracking-tightish">
            Assignment brief
          </h2>
          <div className="mt-3 max-h-[340px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper-raised p-4 font-serif text-[15px] leading-7 text-ink">
            {briefText}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-[22px] tracking-tightish">
                Nebu proposals
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                Confirm only the items you trust. Confirmed items move to the
                left panel after the server saves your decision.
              </p>
            </div>
          </div>

          {view.nebuProposals.length === 0 ? (
            <p className="mt-5 rounded-xl border border-line bg-paper-raised p-4 text-[13px] leading-6 text-ink-muted">
              No active proposals. Run analysis or review confirmed context.
            </p>
          ) : (
            <div className="mt-5 space-y-6">
              {groupByKind(view.nebuProposals).map(([kind, items]) => (
                <section key={kind}>
                  <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-eyebrow text-ink-faint">
                    {getRequirementKindLabel(kind)}
                  </h3>
                  <div className="space-y-3">
                    {items.map((item) => (
                      <RequirementCard key={item.id} requirement={item} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </main>

      <NebuPanel
        collapsed={rightCollapsed}
        onToggle={() => setRightCollapsed(!rightCollapsed)}
        statusPanel={statusPanel}
        rejectedCount={view.rejectedCount}
      />
    </div>
  );
}
