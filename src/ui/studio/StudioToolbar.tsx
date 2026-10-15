'use client';

import { IconChevronDown, IconChevronUp, IconInfoCircle, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconX } from '@tabler/icons-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { TOOL_GROUPS, TOOLS, type ToolDef, type ToolId } from './tools';

const EXPANDED_KEY = 'snickerdoodle.studio.toolbar-expanded';

/**
 * The Studio toolbar. Phone: a bottom bar of icons (thumb zone) that expands into a labelled sheet.
 * Tablet/desktop: a left rail that expands to show labels. Expanded, every tool gets an (i) that
 * explains it in a sentence (tap/click — never hover-only). The expanded/collapsed choice is
 * remembered on this device.
 */
export function StudioToolbar({
  active,
  disabled,
  onTool,
  onHold,
  hidden = [],
}: {
  active: ToolId | null;
  /** Tools that can't be used right now (e.g. "background" before anything is see-through). */
  disabled: Partial<Record<ToolId, string>>;
  onTool: (id: ToolId) => void;
  /** Press-and-hold tools (compare). */
  onHold: (id: ToolId, down: boolean) => void;
  /** Tools that don't apply here at all (the image tools on a blank canvas). */
  hidden?: ToolId[];
}) {
  const tools = TOOLS.filter((t) => !hidden.includes(t.id));
  const groups = TOOL_GROUPS.map((g) => ({ ...g, tools: tools.filter((t) => t.group === g.id) })).filter((g) => g.tools.length);
  const groupHeading = (label: string) => <span className="block px-1 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">{label}</span>;
  const [expanded, setExpanded] = useState(false); // desktop rail (remembered)
  const [sheet, setSheet] = useState(false); // phone: the labelled sheet over the canvas
  const [info, setInfo] = useState<ToolDef | null>(null);
  // Desktop, collapsed rail: hovering (or focusing) an icon shows its name beside it.
  const [tip, setTip] = useState<{ tool: ToolDef; x: number; y: number } | null>(null);
  const showTip = (t: ToolDef, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ tool: t, x: r.right + 10, y: r.top + r.height / 2 });
  };
  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(EXPANDED_KEY) === '1');
    } catch {
      /* private mode */
    }
  }, []);
  const toggle = () => {
    setExpanded((e) => {
      try {
        localStorage.setItem(EXPANDED_KEY, e ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !e;
    });
    setInfo(null);
  };

  const button = (t: ToolDef, withLabel: boolean) => {
    const off = disabled[t.id];
    const isActive = active === t.id;
    const handlers =
      t.kind === 'hold'
        ? {
            onPointerDown: () => !off && onHold(t.id, true),
            onPointerUp: () => onHold(t.id, false),
            onPointerLeave: () => onHold(t.id, false),
            onPointerCancel: () => onHold(t.id, false),
            onKeyDown: (e: React.KeyboardEvent) => (e.key === ' ' || e.key === 'Enter') && onHold(t.id, true),
            onKeyUp: () => onHold(t.id, false),
          }
        : { onClick: () => !off && onTool(t.id) };
    return (
      <button
        type="button"
        aria-label={withLabel ? undefined : t.label}
        aria-pressed={t.kind === 'mode' ? isActive : undefined}
        aria-disabled={off ? true : undefined}
        {...handlers}
        className={`press flex min-h-11 items-center gap-2.5 rounded-[14px] border-2 font-extrabold transition-colors ${
          withLabel ? 'min-w-0 flex-1 px-3 text-left text-[13px]' : 'h-12 w-12 shrink-0 justify-center'
        } ${
          off
            ? 'cursor-not-allowed border-cocoa/10 bg-paper-2 text-ink-faint opacity-60'
            : isActive
              ? 'border-cocoa bg-cocoa text-paper shadow-[0_3px_0_var(--color-honey)]'
              : 'border-cocoa/20 bg-paper text-cocoa hover:border-cocoa'
        }`}
      >
        <Icon icon={t.icon} size={20} className="shrink-0" />
        {withLabel ? <span className="flex-1">{t.label}</span> : null}
      </button>
    );
  };

  const infoButton = (t: ToolDef) => (
    <button
      type="button"
      aria-label={`what does ${t.label} do?`}
      aria-expanded={info?.id === t.id}
      onClick={() => setInfo(info?.id === t.id ? null : t)}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:text-cinnamon"
    >
      <Icon icon={IconInfoCircle} size={18} />
    </button>
  );

  const infoCard = info ? <InfoCard tool={info} onClose={() => setInfo(null)} disabledReason={disabled[info.id]} /> : null;

  return (
    <>
      {/* ── Phone: bottom bar; the chevron slides a labelled sheet up OVER the canvas ── */}
      <div className="md:hidden">
        {sheet ? (
          <>
            <button type="button" aria-label="close the tool list" onClick={() => { setSheet(false); setInfo(null); }} className="fixed inset-0 z-30 bg-cocoa/30" />
            <div role="dialog" aria-label="tools" className="sheet-up pb-safe fixed inset-x-0 bottom-0 z-40 max-h-[78vh] overflow-y-auto rounded-t-[22px] border-t-2 border-cocoa bg-paper px-3 pt-2 shadow-[0_-6px_18px_rgb(43_33_24/0.18)]">
              <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-line" aria-hidden />
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">tools</span>
                <button type="button" onClick={() => { setSheet(false); setInfo(null); }} aria-label="show icons only" className="flex h-11 items-center gap-1 px-2 text-xs font-bold text-ink-soft">
                  icons only <Icon icon={IconChevronDown} size={16} />
                </button>
              </div>
              {infoCard}
              <div className="flex flex-col gap-2 overflow-x-hidden pb-3">
                {groups.map((g) => (
                  <div key={g.id}>
                    {groupHeading(g.label)}
                    <ul className="mt-1 grid grid-cols-1 gap-1.5">
                      {g.tools.map((t) => (
                        <li key={t.id} className="flex items-center gap-1">
                          <span className="flex min-w-0 flex-1" onClickCapture={() => t.kind !== 'hold' && setTimeout(() => setSheet(false), 0)}>
                            {button(t, true)}
                          </span>
                          {infoButton(t)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
        <div className="pb-safe flex items-center gap-1.5 border-t-2 border-cocoa/10 bg-paper px-2 pt-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-2" role="toolbar" aria-label="studio tools">
            {groups.map((g, gi) => (
              <Fragment key={g.id}>
                {gi ? <span aria-hidden className="my-1.5 w-0.5 shrink-0 self-stretch rounded-full bg-cocoa/15" /> : null}
                {g.tools.map((t) => (
                  <span key={t.id} className="contents">
                    {button(t, false)}
                  </span>
                ))}
              </Fragment>
            ))}
          </div>
          <button type="button" onClick={() => setSheet(true)} aria-label="show tool names" className="mb-2 flex h-12 w-11 shrink-0 items-center justify-center rounded-[14px] text-ink-soft">
            <Icon icon={IconChevronUp} size={20} />
          </button>
        </div>
      </div>

      {/* ── Tablet / desktop: left rail ── */}
      <nav
        aria-label="studio tools"
        className={`relative hidden shrink-0 flex-col gap-1.5 overflow-y-auto overflow-x-hidden border-r-2 border-cocoa/10 bg-paper p-2 md:flex ${expanded ? 'w-64' : 'w-[68px]'}`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={expanded ? 'show icons only' : 'show tool names'}
          className="mb-1 flex h-11 items-center justify-center gap-1.5 rounded-[12px] text-xs font-bold text-ink-soft hover:text-cocoa"
        >
          <Icon icon={expanded ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand} size={18} />
          {expanded ? 'icons only' : null}
        </button>
        {groups.map((g, gi) => (
          <Fragment key={g.id}>
            {expanded ? groupHeading(g.label) : gi ? <span aria-hidden className="mx-auto my-1 h-0.5 w-8 shrink-0 rounded-full bg-cocoa/15" /> : null}
            {g.tools.map((t) =>
              expanded ? (
                <div key={t.id} className="flex items-center gap-1">
                  {button(t, true)}
                  {infoButton(t)}
                </div>
              ) : (
                <div
                  key={t.id}
                  className="flex justify-center"
                  onMouseEnter={(e) => showTip(t, e.currentTarget.firstElementChild as HTMLElement)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(e) => showTip(t, e.currentTarget.firstElementChild as HTMLElement)}
                  onBlur={() => setTip(null)}
                >
                  {button(t, false)}
                </div>
              ),
            )}
          </Fragment>
        ))}
        {expanded && info ? <div className="mt-2">{infoCard}</div> : null}
      </nav>
      {tip && !expanded ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 hidden -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-[12px] border-2 border-cocoa bg-cocoa px-3 py-1.5 text-[13px] font-extrabold text-paper shadow-[0_3px_0_var(--color-honey)] md:flex"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.tool.label}
          {tip.tool.key ? <kbd className="rounded border border-paper/40 px-1 text-[10px] font-bold text-paper/80">{tip.tool.key}</kbd> : null}
          {disabled[tip.tool.id] ? <span className="text-[11px] font-bold text-paper/70">· {disabled[tip.tool.id]}</span> : null}
        </div>
      ) : null}
    </>
  );
}

function InfoCard({ tool, onClose, disabledReason }: { tool: ToolDef; onClose: () => void; disabledReason?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={tool.label}
      className="pop-in relative mb-2 rounded-[16px] border-2 border-cocoa bg-honey-band p-3 pr-11 text-[13px] leading-relaxed text-cocoa shadow-[0_3px_0_var(--color-cocoa)] outline-none"
    >
      <p className="mb-1 flex items-center gap-1.5 font-extrabold">
        <Icon icon={tool.icon} size={16} /> {tool.label}
        {tool.key ? <kbd className="ml-1 rounded border border-cocoa/30 bg-paper px-1 text-[10px] font-bold">{tool.key}</kbd> : null}
      </p>
      <p>{tool.info}</p>
      {disabledReason ? <p className="mt-1 text-xs text-ink-soft">({disabledReason})</p> : null}
      <button type="button" onClick={onClose} aria-label="close" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center text-ink-soft">
        <Icon icon={IconX} size={16} />
      </button>
    </div>
  );
}
