import { IconLock } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { cn } from '../cn';
import { Icon } from './Icon';

/** The quiet "this stays yours" reassurance — trust shown, not declared. */
export function TrustLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs text-[#6F6358]', className)}>
      <Icon icon={IconLock} size={15} className="text-green-save" />
      <span>{children}</span>
    </p>
  );
}
