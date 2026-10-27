'use client';

import { IconFlag } from '@tabler/icons-react';
import { useState } from 'react';
import { reportGiftLinkAction } from '@/app/actions/report';
import { REPORT_REASONS } from '@/lib/reports';
import { Icon } from '@/ui/primitives/Icon';
import { ReportModal } from '@/ui/modals/ReportModal';

/**
 * "Report this gift list" — one tap from any gift link (D8). Sending it takes the list offline
 * straight away and puts it in front of our team; we reply if they leave an email.
 */
export function ReportGiftLink({ token }: { token: string }) {
  const [open, setOpen] = useState(false);

  const close = (sent: boolean) => {
    setOpen(false);
    // after a report the list is offline — show the page as it now is
    if (sent) window.location.reload();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 text-[12px] font-bold text-ink-soft underline underline-offset-2 hover:text-cinnamon">
        <Icon icon={IconFlag} size={14} /> report this gift list
      </button>
      <ReportModal
        open={open}
        onClose={close}
        title="Report this gift list"
        subtitle="Tell us what’s wrong — our team will take a look."
        reasons={REPORT_REASONS}
        footnote="Sending this takes the list offline straight away while we check it."
        sentBody={(leftEmail) => `We’ve taken this list offline while our team looks into it.${leftEmail ? ' We’ll reply by email.' : ''}`}
        send={(f) => reportGiftLinkAction({ token, ...f })}
      />
    </>
  );
}
