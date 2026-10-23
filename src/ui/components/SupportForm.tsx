'use client';

import { IconCircleCheck } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { submitSupportAction } from '@/app/actions/support';
import { SUPPORT_TOPICS, supportTopic } from '@/lib/support';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { FaqAnswer } from './FaqAnswer';

type Suggestion = { id: string; q: string; a: string };

/**
 * "Still need a hand?" (founder, 23 Oct): pick a topic → the likeliest answers once more → then the
 * message. Order topics ask for the order reference. Saved on our side before anything is emailed,
 * so a message is never lost. A ≥44px target everywhere; labelled; errors said in words.
 */
export function SupportForm({
  suggestions,
  defaultEmail = '',
  defaultTopic = '',
  defaultOrderRef = '',
}: {
  /** FAQ answers by id, for the topics' "these might help". */
  suggestions: Record<string, Suggestion>;
  defaultEmail?: string;
  defaultTopic?: string;
  defaultOrderRef?: string;
}) {
  const [topicId, setTopicId] = useState(supportTopic(defaultTopic)?.id ?? '');
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState('');
  const [orderRef, setOrderRef] = useState(defaultOrderRef);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; ref?: string; error?: string }>({ status: 'idle' });
  const ids = { email: useId(), name: useId(), order: useId(), message: useId() };
  const topic = supportTopic(topicId);
  const tries = (topic?.suggest ?? []).map((id) => suggestions[id]).filter((s): s is Suggestion => !!s);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return setState({ status: 'error', error: 'pick a topic first' });
    if (message.trim().length < 10) return setState({ status: 'error', error: 'tell us a little more — a sentence or two helps us help you' });
    setState({ status: 'sending' });
    const res = await submitSupportAction({ topic: topic.id, email, name, orderRef, message, website });
    if (res.ok) return setState({ status: 'sent', ref: res.ref });
    setState({
      status: 'error',
      error:
        res.reason === 'too-many'
          ? 'that’s a lot of messages in a row — give it a little while and try again'
          : res.reason === 'invalid'
            ? 'please check your email address and message'
            : 'that didn’t send — please try again in a moment',
    });
  };

  if (state.status === 'sent') {
    return (
      <div role="status" className="rounded-[20px] border-2 border-cocoa bg-leaf-pale p-5 text-center shadow-[0_3px_0_var(--color-cocoa)]">
        <Icon icon={IconCircleCheck} size={28} className="mx-auto text-green-save" />
        <p className="mt-2 font-display text-xl text-cocoa">Thank you — we’ve got it</p>
        <p className="mt-1 text-[15px] text-ink-soft">
          A real person will reply to <b className="text-cocoa">{email.trim()}</b>. {state.ref ? <>Your reference is <b className="text-cocoa">{state.ref}</b>.</> : null}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-[13px] font-extrabold uppercase tracking-wide text-ink-soft">What’s it about?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SUPPORT_TOPICS.map((t) => (
            <label
              key={t.id}
              className={`press flex min-h-14 cursor-pointer items-center gap-3 rounded-[16px] border-2 px-3.5 py-2.5 ${topicId === t.id ? 'border-cocoa bg-honey-band shadow-[0_2px_0_var(--color-cocoa)]' : 'border-cocoa/20 bg-paper hover:border-cocoa/50'}`}
            >
              <input type="radio" name="topic" value={t.id} checked={topicId === t.id} onChange={() => setTopicId(t.id)} className="h-5 w-5 shrink-0 accent-[var(--color-cta)]" />
              <span className="min-w-0">
                <span className="block text-[15px] font-extrabold leading-tight text-cocoa">{t.label}</span>
                <span className="block text-[12px] text-ink-faint">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {topic && tries.length ? (
        <div className="rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper-2 p-4">
          <p className="text-[13px] font-extrabold uppercase tracking-wide text-ink-soft">These might help first</p>
          <ul className="mt-2 flex flex-col gap-3">
            {tries.map((s) => (
              <li key={s.id}>
                <p className="text-[15px] font-extrabold text-cocoa">{s.q}</p>
                <FaqAnswer text={s.a} className="mt-0.5 text-[14px] leading-relaxed text-ink-soft" />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-ink-soft">Still need us? Send a message below.</p>
        </div>
      ) : null}

      {topic ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.email} className="text-[13px] font-extrabold text-cocoa">
                Your email <span className="font-normal text-ink-faint">— we’ll reply here</span>
              </label>
              <input id={ids.email} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 text-[16px] text-cocoa focus:border-cocoa focus:outline-none" />
            </div>
            <div>
              <label htmlFor={ids.name} className="text-[13px] font-extrabold text-cocoa">
                Your name <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <input id={ids.name} type="text" autoComplete="given-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 text-[16px] text-cocoa focus:border-cocoa focus:outline-none" />
            </div>
          </div>
          {topic.order ? (
            <div>
              <label htmlFor={ids.order} className="text-[13px] font-extrabold text-cocoa">
                Order reference <span className="font-normal text-ink-faint">— e.g. SNK-123456, on your orders page and order email</span>
              </label>
              <input id={ids.order} type="text" autoComplete="off" maxLength={32} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} className="mt-1 h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 font-mono text-[16px] uppercase text-cocoa focus:border-cocoa focus:outline-none sm:w-64" />
            </div>
          ) : null}
          <div>
            <label htmlFor={ids.message} className="text-[13px] font-extrabold text-cocoa">
              How can we help?
            </label>
            <textarea id={ids.message} required minLength={10} maxLength={4000} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-3 text-[16px] leading-relaxed text-cocoa focus:border-cocoa focus:outline-none" />
            {topic.id === 'order-problem' ? <p className="mt-1 text-[12px] text-ink-faint">If something’s damaged, we may ask for a photo by email — keep the packaging for now.</p> : null}
            {topic.id === 'privacy' ? (
              <p className="mt-1 text-[12px] text-ink-faint">
                To make a formal data-protection complaint, use <a href="/trust/data-complaint" className="underline underline-offset-2">this form</a> instead.
              </p>
            ) : null}
          </div>
          {/* a honeypot: hidden from people, irresistible to bots */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              website
              <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
          {state.status === 'error' ? (
            <p role="alert" className="text-[14px] font-semibold text-cinnamon">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={state.status === 'sending'}>
            {state.status === 'sending' ? 'sending…' : 'send to our team'}
          </Button>
        </>
      ) : null}
    </form>
  );
}
