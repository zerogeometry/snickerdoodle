'use client';

import { IconX } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';
import type { ToolDef } from './tools';

/**
 * A tool's icon — with its little tomato ✕ where the tool takes something away (remove background:
 * top-left; the remove-colour pipette: top-right), so they read at a glance. The ✕ is ringed in the
 * button's own colour (`--glyph-ring`, paper by default) so it sits cleanly on any state.
 */
export function ToolGlyph({ tool, size = 20, className }: { tool: Pick<ToolDef, 'icon' | 'badge'>; size?: number; className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className ?? ''}`}>
      <Icon icon={tool.icon} size={size} />
      {tool.badge ? (
        <span
          aria-hidden
          className={`absolute flex items-center justify-center rounded-full bg-cta text-white ${tool.badge === 'tl' ? '-left-[5px] -top-[5px]' : '-right-[5px] -top-[5px]'}`}
          style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62), boxShadow: '0 0 0 2px var(--glyph-ring, var(--color-paper))' }}
        >
          <Icon icon={IconX} size={Math.round(size * 0.46)} stroke={3} />
        </span>
      ) : null}
    </span>
  );
}
