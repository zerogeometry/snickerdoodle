'use client';

import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SPINNABLE } from '@/ui/three/spinnable';

// DEV-ONLY 3D review harness: every product's spin view on one page with a
// brand-safe sample drawing (drawn in-page — no child data, no uploads). Used to
// eyeball the whole parametric range at once; excluded from production builds.
const Product3D = dynamic(() => import('@/ui/three/Product3D'), { ssr: false });

/** Display-only variant facts for the harness (mm + attrs mirror the defaults). */
const HARNESS: Record<string, { mm: [number, number]; attrs?: Record<string, string> }> = {
  mug: { mm: [209, 98] },
  framedPrint: { mm: [279, 356], attrs: { colour: 'gold' } },
  cushion: { mm: [280, 280], attrs: { size: 'heart' } },
  blanket: { mm: [600, 1000], attrs: { colour: 'pink' } },
  sack: { mm: [320, 500] },
  storybook: { mm: [148, 210] },
  jigsaw: { mm: [250, 200] },
  calendar: { mm: [297, 210] },
  card: { mm: [127, 178] },
  bauble: { mm: [82, 82] },
};

function sampleDrawing(): string {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 700;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 900, 700);
  x.lineWidth = 12;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = '#d2691e';
  x.strokeRect(300, 330, 280, 230);
  x.beginPath();
  x.moveTo(280, 340);
  x.lineTo(440, 190);
  x.lineTo(600, 340);
  x.closePath();
  x.stroke();
  x.strokeStyle = '#84bbd0';
  x.strokeRect(400, 430, 90, 130);
  x.strokeStyle = '#f2a640';
  x.beginPath();
  x.arc(720, 150, 55, 0, 7);
  x.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    x.beginPath();
    x.moveTo(720 + Math.cos(a) * 75, 150 + Math.sin(a) * 75);
    x.lineTo(720 + Math.cos(a) * 105, 150 + Math.sin(a) * 105);
    x.stroke();
  }
  x.strokeStyle = '#93b97c';
  x.beginPath();
  x.moveTo(60, 640);
  for (let i = 0; i < 16; i++) x.quadraticCurveTo(85 + i * 50, 615, 110 + i * 50, 640);
  x.stroke();
  return c.toDataURL('image/png');
}

export default function SpinHarness() {
  if (process.env.NODE_ENV === 'production') notFound();
  const [img, setImg] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [view, setView] = useState<'spin' | 'front' | 'back'>('spin');
  useEffect(() => {
    setImg(sampleDrawing());
    const q = new URLSearchParams(window.location.search);
    setOnly(q.get('only'));
    const v = q.get('view');
    if (v === 'front' || v === 'back') setView(v);
  }, []);
  if (!img) return null;
  const keys = only ? SPINNABLE.filter((k) => k === only) : SPINNABLE;
  return (
    <main className="min-h-dvh bg-oat p-6">
      <h1 className="mb-4 font-display text-2xl font-semibold">spin views — dev harness</h1>
      <div className={only ? 'mx-auto max-w-2xl' : 'grid grid-cols-2 gap-4 md:grid-cols-4'}>
        {keys.map((kind) => (
          <figure key={kind} className="rounded-2xl border border-[#EADFC9] bg-[#FBF5E9] p-2">
            <div className={only ? 'h-[540px] w-full' : 'h-72 w-full'} data-spin={kind}>
              <Product3D
                kind={kind}
                image={img}
                placement={{ scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }}
                printWmm={HARNESS[kind]!.mm[0]}
                printHmm={HARNESS[kind]!.mm[1]}
                attributes={HARNESS[kind]!.attrs}
                view={view}
              />
            </div>
            <figcaption className="mt-1 text-center text-xs font-bold text-[#7A6A58]">{kind}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
