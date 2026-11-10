'use client';

import { IconChevronDown, IconDeviceMobile, IconPencil, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteDrawingDaysAction, removeEverythingDrawSentAction, unlinkAppDeviceAction, updateAppSyncAction } from '@/app/actions/appLink';
import type { ConnectSyncDraft, SyncChoices } from '@/lib/drawSync';
import type { LinkedDevice } from '@/server/app/link';
import type { ProgressBackupSummary } from '@/server/app/sync';
import { toast } from '@/lib/store';
import { DrawSyncSlate, KEEPSAKE_OPTIONS } from '@/ui/components/DrawSyncSlate';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "the proud pile only · names & birthdays" — what syncs, in a line. */
export function syncSummary(sync: SyncChoices, chosen: boolean): string {
  if (!chosen) return 'nothing yet — pick what syncs';
  const parts = [KEEPSAKE_OPTIONS.find((o) => o.value === sync.keepsakes)?.label ?? 'nothing automatic'];
  if (sync.children) parts.push('names & birthdays');
  if (sync.progress) parts.push('drawing days');
  if (sync.birthdays) parts.push('family birthdays');
  return parts.join(' · ');
}

/** One linked phone: what syncs (editable, saved as you tap) and disconnect. */
function DeviceRow({ device, busy, onDisconnect }: { device: LinkedDevice; busy: boolean; onDisconnect: () => void }) {
  const [sync, setSync] = useState<SyncChoices>(device.sync);
  const [chosen, setChosen] = useState(device.syncChosen);
  const [open, setOpen] = useState(!device.syncChosen);
  const [saving, setSaving] = useState(false);
  const panelId = `draw-sync-${device.id}`;

  const change = async (next: ConnectSyncDraft) => {
    if (saving || !next.keepsakes) return;
    const patch: Partial<SyncChoices> = {};
    if (next.keepsakes !== sync.keepsakes || !chosen) patch.keepsakes = next.keepsakes;
    if (next.children !== sync.children) patch.children = next.children;
    if (next.progress !== sync.progress) patch.progress = next.progress;
    if (next.birthdays !== sync.birthdays) patch.birthdays = next.birthdays;
    const before = { sync, chosen };
    setSync({ keepsakes: next.keepsakes, children: next.children, progress: next.progress, birthdays: next.birthdays });
    setChosen(true);
    setSaving(true);
    try {
      const res = await updateAppSyncAction({ tokenId: device.id, patch });
      if (!res.ok) throw new Error('not saved');
      setSync(res.sync);
      toast('saved — the phone follows it next time it checks in');
    } catch {
      setSync(before.sync);
      setChosen(before.chosen);
      toast('couldn’t save that just now — try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-xl bg-paper-2 px-3 py-2">
      <div className="flex items-center gap-3">
        <Icon icon={IconDeviceMobile} size={20} className="shrink-0 text-cocoa" />
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-cocoa">
          <b>{device.label}</b> · {device.familyName}
          <span className="block text-[11px] text-ink-faint">
            linked {day(device.linkedOn)} · last used {day(device.lastUsedOn)}
          </span>
        </span>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onDisconnect} aria-label={`disconnect ${device.label}`}>
          {busy ? 'disconnecting…' : 'disconnect'}
        </Button>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-left text-[12px] text-cocoa focus-visible:outline-2"
      >
        <span>
          <span className="font-extrabold">what syncs:</span> {syncSummary(sync, chosen)}
        </span>
        <Icon icon={IconChevronDown} size={16} className={open ? 'rotate-180 text-ink-soft' : 'text-ink-soft'} />
      </button>
      {open ? (
        <div id={panelId} className="pb-2 pt-1">
          {!chosen ? <p className="mb-2 rounded-lg bg-honey-band px-2.5 py-1.5 text-[11px] font-semibold text-cocoa">this phone was linked before you could choose, so nothing syncs until you pick.</p> : null}
          <DrawSyncSlate name={`dev-${device.id}`} value={{ keepsakes: chosen ? sync.keepsakes : null, children: sync.children, progress: sync.progress, birthdays: sync.birthdays }} onChange={change} disabled={saving} />
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">turning something off stops it from now on — it never deletes what’s already here.</p>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Snickerdoodle Draw on the account page: the phones linked to this account — each with what syncs
 * (the same three choices as the connect page, editable here) and disconnect — plus any backed-up
 * drawing days, deletable in one tap. Or a quiet word about the app if nothing's linked.
 */
export function DrawAppCard({ devices, backups = [], sentCount = 0 }: { devices: LinkedDevice[]; backups?: ProgressBackupSummary[]; sentCount?: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const router = useRouter();
  const disconnect = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      const res = await unlinkAppDeviceAction({ tokenId: id });
      toast(res.ok ? 'disconnected — the drawings on that phone stay put' : 'that one’s already disconnected');
    } catch {
      toast('couldn’t disconnect just now — try again');
    } finally {
      setBusy(null);
    }
  };
  const deleteDays = async () => {
    if (busy) return;
    setBusy('days');
    try {
      const res = await deleteDrawingDaysAction();
      if (!res.ok) throw new Error('no');
      setGone(true);
      toast('backed-up drawing days deleted — the phones keep their own');
    } catch {
      toast('couldn’t delete just now — try again');
    } finally {
      setBusy(null);
    }
  };
  const showBackups = backups.length > 0 && !gone;
  const [confirming, setConfirming] = useState(false);
  const removeAll = async () => {
    if (busy) return;
    setBusy('remove-all');
    try {
      const res = await removeEverythingDrawSentAction({ confirm: 'remove-everything' });
      if (!res.ok) throw new Error('no');
      setConfirming(false);
      toast(
        res.kept > 0
          ? `removed ${res.removed} — ${res.kept} ${res.kept === 1 ? 'is' : 'are'} in an order that isn’t made yet, so ${res.kept === 1 ? 'it stays' : 'they stay'} until it’s on its way`
          : `removed ${res.removed} for good — the drawings on the phone stay put`,
      );
      router.refresh();
    } catch {
      toast('couldn’t remove them just now — try again');
    } finally {
      setBusy(null);
    }
  };
  const lastBackup = backups.map((b) => b.updatedOn).sort().at(-1);
  return (
    <section aria-labelledby="draw-app-title" className="pop-in mt-4 rounded-2xl border-2 border-cocoa bg-paper p-4">
      <h2 id="draw-app-title" className="flex items-center gap-2 font-display text-lg text-cocoa">
        <Icon icon={IconPencil} size={18} className="text-cinnamon" /> snickerdoodle draw
      </h2>
      {devices.length === 0 ? (
        <>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">our little drawing app for 3–12s. link it, and you choose which drawings land in your keepsake box.</p>
          <Button href="/app/link" variant="secondary" size="sm" className="mt-3">
            link snickerdoodle draw
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">linked phones send only what you choose. they can’t see the rest of your keepsake box.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {devices.map((d) => (
              <DeviceRow key={d.id} device={d} busy={busy === d.id} onDisconnect={() => disconnect(d.id)} />
            ))}
          </ul>
        </>
      )}
      {showBackups ? (
        <div className="mt-3 flex flex-col items-start gap-1 rounded-xl border-2 border-dashed border-cocoa/20 px-3 py-2 sm:flex-row sm:items-center sm:gap-2">
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-cocoa">
            <b>drawing days backed up</b> for {backups.map((b) => b.firstName).join(', ')}
            {lastBackup ? <span className="block text-[11px] text-ink-faint">last backed up {day(lastBackup)}</span> : null}
          </p>
          <Button variant="ghost" size="sm" disabled={busy === 'days'} onClick={deleteDays}>
            <Icon icon={IconTrash} size={14} /> {busy === 'days' ? 'deleting…' : 'delete the backup'}
          </Button>
        </div>
      ) : null}
      {sentCount > 0 ? (
        <div className="mt-3 rounded-xl border-2 border-dashed border-cocoa/20 px-3 py-2">
          {!confirming ? (
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-cocoa">
                <b>
                  {sentCount} {sentCount === 1 ? 'drawing' : 'drawings'} from snickerdoodle draw
                </b>{' '}
                in your keepsake box
              </p>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-expanded={confirming} aria-controls="draw-remove-confirm">
                <Icon icon={IconTrash} size={14} /> remove everything draw sent
              </Button>
            </div>
          ) : (
            <div id="draw-remove-confirm" role="group" aria-labelledby="draw-remove-q">
              <p id="draw-remove-q" className="text-[13px] font-bold leading-snug text-cocoa">
                remove all {sentCount} {sentCount === 1 ? 'drawing' : 'drawings'} draw sent, for good?
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
                they’re deleted from your keepsake box, any ready-to-buy links for them stop, and we can’t bring them back. the drawings on the phone stay put. anything in an order that isn’t made yet waits until it’s on its way.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" disabled={busy === 'remove-all'} onClick={removeAll}>
                  {busy === 'remove-all' ? 'removing…' : 'yes, remove them'}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy === 'remove-all'} onClick={() => setConfirming(false)}>
                  keep them
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
