'use client';

import { IconMail, IconPlus, IconX } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createCodeAction, revealPartnerEmailAction, setCodeActiveAction } from '@/app/actions/adminCodes';
import { toast } from '@/lib/store';
import { formatPence } from '@/pricing/format';
import type { CodeLine, CodeState, PartnerOwed } from '@/server/admin/codes';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';

/**
 * The codes screen's interactive parts (/admin/codes): the "new code" form, switching a code off or on (with the
 * "are you sure?" built into the card, never a browser pop-up), and showing a partner's email on request. Every value
 * typed here is checked again on the server by the same rules the terminal script uses; nothing priced here is trusted.
 */

type Offer = 'percent' | 'pounds' | 'card' | 'partner';
type Field = 'code' | 'kind' | 'amount' | 'minSpend' | 'maxUses' | 'startsOn' | 'endsOn' | 'commission' | 'partnerName' | 'partnerType' | 'partnerEmail' | 'classLabel';
type Problems = Partial<Record<Field, string>>;

const OFFERS: { id: Offer; label: string; hint: string }[] = [
  { id: 'percent', label: 'percent off', hint: 'like 10% off everything in the basket' },
  { id: 'pounds', label: 'pounds off', hint: 'like £5 off, usually with a minimum spend' },
  { id: 'card', label: 'a free card', hint: 'one greetings card’s price comes off, on a first order' },
  { id: 'partner', label: 'partner code', hint: 'a creator, school or leaflet spot earns commission on orders' },
];

export const PARTNER_LABEL: Record<string, string> = { INFLUENCER: 'creator', PTA: 'school PTA', CAMPAIGN: 'campaign', REFERRAL: 'referral' };

const inputCls = 'mt-1 block h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 text-[16px] text-cocoa focus:border-cocoa focus:outline-none aria-[invalid=true]:border-cinnamon';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

// ── new code ─────────────────────────────────────────────────────────────────

/** What a partner's code gives the family (founder, 27 Nov 2026): the free first card, or a percent off. */
type PartnerGives = 'card' | 'percent';

/**
 * The new-code form as the save action's input: only what the chosen offer needs. A partner code that gives the free
 * first card is a FREE_CARD code with the partner's commission on it (a leaflet spot, say): no amount is sent.
 */
export function codeRequest(offer: Offer, partnerGives: PartnerGives, v: typeof EMPTY) {
  const isPartner = offer === 'partner';
  const card = offer === 'card' || (isPartner && partnerGives === 'card');
  return {
    code: v.code,
    kind: card ? 'FREE_CARD' : offer === 'pounds' ? 'FIXED' : 'PERCENT',
    amount: card ? '' : v.amount,
    minSpend: v.minSpend,
    maxUses: v.maxUses,
    startsOn: v.startsOn,
    endsOn: v.endsOn,
    firstOrder: v.firstOrder,
    ...(isPartner ? { commission: v.commission, partnerName: v.partnerName, partnerType: v.partnerType, partnerEmail: v.partnerEmail, classLabel: v.partnerType === 'PTA' ? v.classLabel : '' } : {}),
  };
}

const EMPTY = { code: '', amount: '10', minSpend: '', maxUses: '', startsOn: '', endsOn: '', firstOrder: false, commission: '10', partnerName: '', partnerType: 'INFLUENCER', partnerEmail: '', classLabel: '' };

export function NewCode() {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState<Offer>('percent');
  const [partnerGives, setPartnerGives] = useState<PartnerGives>('card');
  const [v, setV] = useState(EMPTY);
  const [problems, setProblems] = useState<Problems>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const pick = (o: Offer) => {
    setOffer(o);
    setProblems({});
    setV((s) => ({ ...s, amount: o === 'pounds' ? '5' : o === 'partner' ? (s.partnerType === 'PTA' ? '0' : '10') : o === 'percent' ? '10' : s.amount }));
  };
  const close = () => {
    setOpen(false);
    setV(EMPTY);
    setOffer('percent');
    setPartnerGives('card');
    setProblems({});
    setFailed(false);
  };

  const isPartner = offer === 'partner';
  const givesCard = offer === 'card' || (isPartner && partnerGives === 'card');
  const alwaysFirst = offer === 'card' || (isPartner && v.partnerType === 'INFLUENCER');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const res = await createCodeAction(codeRequest(offer, partnerGives, v));
      if (res.ok) {
        toast(`${res.code} is made and working`);
        close();
        router.refresh();
        return;
      }
      const p: Problems = {};
      for (const x of res.problems ?? []) p[x.field as Field] ??= x.message;
      setProblems(p);
      setFailed(!res.problems?.length);
      requestAnimationFrame(() => summaryRef.current?.focus());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-5">
        <Button size="sm" onClick={() => setOpen(true)} aria-expanded={false}>
          <Icon icon={IconPlus} size={18} /> new code
        </Button>
      </div>
    );
  }

  const problemList = Object.values(problems);
  const err = (f: Field) => (problems[f] ? { 'aria-invalid': true as const, 'aria-describedby': `${formId}-${f}` } : {});
  const msg = (f: Field) =>
    problems[f] ? (
      <span id={`${formId}-${f}`} className="mt-1 block text-sm font-bold text-cinnamon">
        {problems[f]}
      </span>
    ) : null;

  return (
    <form id={formId} onSubmit={submit} noValidate className="mt-5 rounded-[20px] border-2 border-cocoa bg-paper p-4 shadow-[0_3px_0_var(--color-cocoa)] md:p-5" aria-labelledby={`${formId}-title`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={`${formId}-title`} className="font-display text-xl text-cocoa">
          new code
        </h2>
        <button type="button" onClick={close} className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-honey-band" aria-label="close the new code form">
          <Icon icon={IconX} size={20} />
        </button>
      </div>

      <div ref={summaryRef} tabIndex={-1} className="outline-none">
        {problemList.length || failed ? (
          <div role="alert" className="mt-3 rounded-[14px] border-2 border-cinnamon/40 bg-berry-pale p-3 text-sm text-cocoa">
            {failed ? <p className="font-bold">That didn’t save. Refresh the page and try again.</p> : <p className="font-bold">Nearly: {problemList.length === 1 ? 'one thing' : `${problemList.length} things`} to fix.</p>}
          </div>
        ) : null}
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-bold text-cocoa">what does it give?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {OFFERS.map((o) => (
            <Chip key={o.id} active={offer === o.id} onClick={() => pick(o.id)} className="text-sm">
              {o.label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-soft">{OFFERS.find((o) => o.id === offer)?.hint}</p>
        {msg('kind')}
      </fieldset>

      {isPartner ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-bold text-cocoa">what the family gets</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip active={partnerGives === 'card'} onClick={() => { setPartnerGives('card'); setProblems({}); }} className="text-sm">
              a free first card
            </Chip>
            <Chip active={partnerGives === 'percent'} onClick={() => { setPartnerGives('percent'); setProblems({}); }} className="text-sm">
              percent off
            </Chip>
          </div>
        </fieldset>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-bold text-cocoa">
          the code people type
          <input
            className={`${inputCls} font-mono uppercase tracking-wide`}
            value={v.code}
            onChange={set('code')}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            placeholder="enter code"
            required
            {...err('code')}
          />
          <span className="mt-1 block text-xs font-normal text-ink-soft">3 to 32 letters, numbers or dashes.</span>
          {msg('code')}
        </label>

        {offer === 'card' ? (
          <p className="self-end rounded-[14px] bg-honey-band p-3 text-sm text-cocoa">
            The cheapest single card in the basket comes off, and only on a buyer’s first order. If the basket is too small to carry it, the code waits for a bigger one.
          </p>
        ) : givesCard ? (
          <p className="self-end rounded-[14px] bg-honey-band p-3 text-sm text-cocoa">
            The cheapest single card comes off a signed-in family’s first order. When it can’t (a guest, or no card in the basket), the order still counts for the partner.
          </p>
        ) : (
          <label className="block text-sm font-bold text-cocoa">
            {offer === 'pounds' ? 'how much off (£)' : isPartner ? 'their followers’ discount (%)' : 'how much off (%)'}
            <input className={inputCls} value={v.amount} onChange={set('amount')} inputMode="decimal" autoComplete="off" required {...err('amount')} />
            <span className="mt-1 block text-xs font-normal text-ink-soft">
              {offer === 'pounds' ? 'More than £0, up to £100.' : isPartner ? 'Up to 50. Put 0 for a school code that only raises money.' : 'Up to 50.'}
            </span>
            {msg('amount')}
          </label>
        )}
      </div>

      {isPartner ? (
        <fieldset className="mt-4 rounded-[16px] border-2 border-dashed border-cocoa/25 p-3 md:p-4">
          <legend className="px-1 text-sm font-bold text-cocoa">the partner</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-cocoa">
              who they are
              <input className={inputCls} value={v.partnerName} onChange={set('partnerName')} autoComplete="off" maxLength={80} placeholder="Sarah (Instagram) or St Mary’s PTA" {...err('partnerName')} />
              {msg('partnerName')}
            </label>
            <label className="block text-sm font-bold text-cocoa">
              what kind of partner
              <select
                className={inputCls}
                value={v.partnerType}
                onChange={(e) => {
                  const t = e.target.value;
                  setV((s) => ({ ...s, partnerType: t, amount: t === 'PTA' && s.amount === '10' ? '0' : t !== 'PTA' && s.amount === '0' ? '10' : s.amount }));
                }}
                {...err('partnerType')}
              >
                <option value="INFLUENCER">creator (earns on a follower’s first order)</option>
                <option value="PTA">school PTA (earns on every order)</option>
                <option value="CAMPAIGN">campaign or leaflet spot (earns on a first order)</option>
              </select>
              {msg('partnerType')}
            </label>
            <label className="block text-sm font-bold text-cocoa">
              their commission (%)
              <input className={inputCls} value={v.commission} onChange={set('commission')} inputMode="decimal" autoComplete="off" {...err('commission')} />
              <span className="mt-1 block text-xs font-normal text-ink-soft">Of the order’s goods after the discount, before VAT. Up to 30.</span>
              {msg('commission')}
            </label>
            <label className="block text-sm font-bold text-cocoa">
              their own email <span className="font-normal text-ink-soft">(optional)</span>
              <input className={inputCls} type="email" value={v.partnerEmail} onChange={set('partnerEmail')} autoComplete="off" maxLength={254} {...err('partnerEmail')} />
              <span className="mt-1 block text-xs font-normal text-ink-soft">So the code never works on, or earns from, their own orders.</span>
              {msg('partnerEmail')}
            </label>
            {v.partnerType === 'PTA' ? (
              <label className="block text-sm font-bold text-cocoa">
                class <span className="font-normal text-ink-soft">(optional)</span>
                <input className={inputCls} value={v.classLabel} onChange={set('classLabel')} autoComplete="off" maxLength={40} placeholder="Year 2" {...err('classLabel')} />
                <span className="mt-1 block text-xs font-normal text-ink-soft">Class codes add up under the school’s name.</span>
                {msg('classLabel')}
              </label>
            ) : null}
          </div>
        </fieldset>
      ) : null}

      <details className="group mt-4 rounded-[16px] border-2 border-cocoa/15 bg-paper-2 p-3 md:p-4" open={!!(problems.minSpend || problems.maxUses || problems.startsOn || problems.endsOn) || undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-bold text-cocoa">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
          more options: minimum spend, how many uses, dates, first orders
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-cocoa">
            minimum spend (£) <span className="font-normal text-ink-soft">(optional)</span>
            <input className={inputCls} value={v.minSpend} onChange={set('minSpend')} inputMode="decimal" autoComplete="off" placeholder="none" {...err('minSpend')} />
            {msg('minSpend')}
          </label>
          <label className="block text-sm font-bold text-cocoa">
            how many orders can use it <span className="font-normal text-ink-soft">(optional)</span>
            <input className={inputCls} value={v.maxUses} onChange={set('maxUses')} inputMode="numeric" autoComplete="off" placeholder="no limit" {...err('maxUses')} />
            {msg('maxUses')}
          </label>
          <label className="block text-sm font-bold text-cocoa">
            starts working on <span className="font-normal text-ink-soft">(optional)</span>
            <input className={inputCls} type="date" value={v.startsOn} onChange={set('startsOn')} {...err('startsOn')} />
            <span className="mt-1 block text-xs font-normal text-ink-soft">From midnight as that day begins (UK time). Blank: straight away.</span>
            {msg('startsOn')}
          </label>
          <label className="block text-sm font-bold text-cocoa">
            stops working on <span className="font-normal text-ink-soft">(optional)</span>
            <input className={inputCls} type="date" value={v.endsOn} onChange={set('endsOn')} {...err('endsOn')} />
            <span className="mt-1 block text-xs font-normal text-ink-soft">At midnight as that day begins, so 24 Dec means the last day it works is 23 Dec.</span>
            {msg('endsOn')}
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-cocoa md:col-span-2">
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--color-cta)]" checked={alwaysFirst || v.firstOrder} disabled={alwaysFirst} onChange={(e) => setV((s) => ({ ...s, firstOrder: e.target.checked }))} />
            <span>
              first order only
              {alwaysFirst ? <span className="block text-xs font-normal text-ink-soft">{offer === 'card' ? 'A free card' : 'A creator’s code'} is always for a first order.</span> : null}
            </span>
          </label>
        </div>
      </details>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'making it…' : 'make the code'}
        </Button>
        <Button type="button" variant="secondary" onClick={close} disabled={busy}>
          cancel
        </Button>
      </div>
    </form>
  );
}

// ── the list ─────────────────────────────────────────────────────────────────

type CodeItem = Omit<CodeLine, 'startsAt' | 'endsAt' | 'createdAt'> & { startsAt: string | null; endsAt: string | null; createdAt: string };

const STATE: Record<CodeState, { label: string; cls: string }> = {
  live: { label: 'working', cls: 'border-green-save bg-leaf-pale text-green-save' },
  off: { label: 'switched off', cls: 'border-cocoa/30 bg-paper-2 text-ink-soft' },
  ended: { label: 'ended', cls: 'border-cocoa/30 bg-paper-2 text-ink-soft' },
  'not-started': { label: 'starts later', cls: 'border-cobalt bg-sky-pale text-cobalt' },
  'used-up': { label: 'used up', cls: 'border-cinnamon bg-berry-pale text-cinnamon' },
};

export function CodeList({ codes }: { codes: CodeItem[] }) {
  const router = useRouter();
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const flip = async (c: CodeItem) => {
    setBusy(c.id);
    try {
      const r = await setCodeActiveAction(c.id, !c.active);
      toast(r.ok ? `${c.code} is switched ${c.active ? 'off' : 'back on'}` : 'that didn’t work: refresh and try again');
      setAsking(null);
      router.refresh();
    } catch {
      toast('that didn’t work: refresh and try again');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="mt-4 space-y-4" aria-label="codes">
      {codes.map((c) => {
        const bits = [
          c.firstOrderOnly ? 'first order only' : 'any order',
          c.minSpendPence ? `when they spend ${formatPence(c.minSpendPence)}` : null,
          c.maxRedemptions !== null ? `${c.uses} of ${c.maxRedemptions} used` : `${c.uses} used`,
          c.holding ? `${c.holding} at checkout now` : null,
          c.startsAt ? `from ${day(c.startsAt)}` : null,
          c.endsAt ? `stops at the start of ${day(c.endsAt)}` : null,
        ].filter(Boolean);
        return (
          <li key={c.id} className="rounded-[20px] border-2 border-cocoa/15 bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="break-all font-mono text-lg font-extrabold tracking-wide text-cocoa">{c.code}</span>
                <span className="font-bold text-cocoa">{c.offer}</span>
              </p>
              <span className={`inline-flex items-center rounded-pill border-2 px-2.5 text-xs font-extrabold leading-6 ${STATE[c.state].cls}`}>{STATE[c.state].label}</span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{bits.join(' · ')}</p>
            {c.partnerName || c.commissionBps ? (
              <p className="mt-1 text-sm text-ink-soft">
                <b className="text-cocoa">{c.partnerName ?? 'no partner named'}</b>
                {c.classLabel ? ` (${c.classLabel})` : ''}
                {c.partnerType ? ` · ${PARTNER_LABEL[c.partnerType]}` : ''} · {c.commissionBps / 100}% commission
                {c.hasPartnerEmail ? ' · their email is on file' : ''}
              </p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Fig label="paid orders" value={String(c.uses)} />
              <Fig label="taken" value={formatPence(c.revenuePence)} />
              <Fig label="off for shoppers" value={formatPence(c.discountPence)} />
              <Fig label="commission" value={c.commissionBps || c.commissionPence ? formatPence(c.commissionPence) : '—'} />
            </dl>
            {asking === c.id ? (
              <ConfirmFlip code={c} busy={busy === c.id} onYes={() => flip(c)} onNo={() => setAsking(null)} />
            ) : (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setAsking(c.id)}
                  className="inline-flex min-h-11 items-center rounded-pill border-2 border-cocoa/25 bg-paper px-4 text-sm font-bold text-ink-soft hover:border-cocoa"
                >
                  {c.active ? 'switch off' : 'switch back on'}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-paper-2 px-2.5 py-1.5">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="font-bold text-cocoa">{value}</dd>
    </div>
  );
}

function ConfirmFlip({ code, busy, onYes, onNo }: { code: CodeItem; busy: boolean; onYes: () => void; onNo: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => box.current?.querySelector('button')?.focus(), []); // the "yes" button, so the keyboard lands on the question
  return (
    <div ref={box} role="group" aria-labelledby={id} className="mt-3 rounded-[16px] border-2 border-cocoa bg-honey-band p-3">
      <p id={id} className="text-sm text-cocoa">
        {code.active ? (
          <>
            <b>Switch {code.code} off?</b> It stops working straight away, even for someone already at checkout. Orders already paid keep their discount, and you can switch it back on.
          </>
        ) : (
          <>
            <b>Switch {code.code} back on?</b> Anyone with the code can use it again, within its dates and uses.
          </>
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onYes} disabled={busy}>
          {busy ? 'one moment…' : code.active ? 'yes, switch it off' : 'yes, switch it on'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onNo} disabled={busy}>
          {code.active ? 'keep it on' : 'leave it off'}
        </Button>
      </div>
    </div>
  );
}

// ── commission owed ──────────────────────────────────────────────────────────

export function CommissionPartners({ partners }: { partners: PartnerOwed[] }) {
  return (
    <ul className="mt-4 space-y-3" aria-label="partners">
      {partners.map((p) => (
        <li key={`${p.key}|${p.partnerType}`} className="rounded-[20px] border-2 border-cocoa/15 bg-paper p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-bold text-cocoa">
              {p.partnerName ?? p.key}
              {p.partnerType ? <span className="font-normal text-ink-soft"> · {PARTNER_LABEL[p.partnerType]}</span> : null}
            </p>
            <p className="font-display text-xl text-cocoa">{formatPence(p.commissionPence)}</p>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {p.paidOrders} paid order{p.paidOrders === 1 ? '' : 's'}, {p.earningOrders} earning · {formatPence(p.salesPence)} taken · code{p.codes.length === 1 ? '' : 's'}{' '}
            <span className="font-mono text-cocoa">{p.codes.join(', ')}</span>
            {p.classes.length ? ` · ${p.classes.join(', ')}` : ''}
          </p>
          {p.hasEmail ? <RevealEmail partnerKey={p.key} /> : <p className="mt-2 text-xs text-ink-faint">No email on file for them.</p>}
        </li>
      ))}
    </ul>
  );
}

function RevealEmail({ partnerKey }: { partnerKey: string }) {
  const [emails, setEmails] = useState<string[] | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const show = async () => {
    setState('busy');
    try {
      const r = await revealPartnerEmailAction(partnerKey);
      if (!r.ok) throw new Error('refused');
      setEmails(r.emails ?? []);
      setState('idle');
    } catch {
      setState('failed');
    }
  };
  if (emails) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        {emails.length ? (
          emails.map((e) => (
            <a key={e} href={`mailto:${e}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa bg-honey-band px-4 font-bold text-cocoa">
              <Icon icon={IconMail} size={16} /> {e}
            </a>
          ))
        ) : (
          <span className="text-ink-soft">No email on file any more.</span>
        )}
      </p>
    );
  }
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <button
        type="button"
        onClick={show}
        disabled={state === 'busy'}
        className="inline-flex min-h-11 items-center rounded-pill border-2 border-cocoa/25 bg-paper px-4 font-bold text-ink-soft hover:border-cocoa disabled:opacity-50"
      >
        {state === 'busy' ? 'one moment…' : 'show their email'}
      </button>
      <span className="text-xs text-ink-faint">{state === 'failed' ? 'That didn’t work: refresh and try again.' : 'Looking is noted in the records.'}</span>
    </p>
  );
}

// ── loading + error, the same for each section ───────────────────────────────

export function SectionSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <div role="status" aria-label={label} className="mt-4 space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-[20px] border-2 border-cocoa/10 bg-paper motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function SectionError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mt-4 rounded-[20px] border-2 border-cinnamon/40 bg-berry-pale p-4 text-sm text-cocoa">
      <p className="font-bold">something went wrong</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}
