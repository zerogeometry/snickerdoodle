'use client';

import { IconX } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';
import type { ToolDef } from './tools';

/**
 * A tool's icon — with a little ✕ top-right where the tool takes something away (remove background,
 * the remove-colour pipette), so they read at a glance. The ✕ is the icon's own colour; it sits on a
 * patch of the button's colour (`--glyph-ring`, paper by default) that cuts the lines behind it.
 */
export function ToolGlyph({ tool, size = 20, className }: { tool: Pick<ToolDef, 'icon' | 'badge'>; size?: number; className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className ?? ''}`}>
      <Icon icon={tool.icon} size={size} />
      {tool.badge ? (
        <span
          aria-hidden
          className="absolute -right-[5px] -top-[5px] flex items-center justify-center rounded-full"
          style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62), background: 'var(--glyph-ring, var(--color-paper))' }}
        >
          <Icon icon={IconX} size={Math.round(size * 0.46)} stroke={3} />
        </span>
      ) : null}
    </span>
  );
}
