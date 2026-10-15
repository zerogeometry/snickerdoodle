import {
  IconBackground,
  IconColorPicker,
  IconCrop,
  IconEraser,
  IconEye,
  IconFlipVertical,
  IconPalette,
  IconRestore,
  IconRotateClockwise,
  IconBrush,
  IconBucketDroplet,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

export type ToolId = 'removeBg' | 'removeColour' | 'erase' | 'restore' | 'seeOn' | 'background' | 'rotate' | 'flip' | 'crop' | 'compare' | 'startAgain';

export interface ToolDef {
  id: ToolId;
  label: string;
  icon: TablerIcon;
  /** What the (i) explains — one or two warm, plain sentences. */
  info: string;
  /** Keyboard shortcut (desktop), shown in the expanded toolbar. */
  key?: string;
  /** 'mode' = stays selected (brushes, crop…); 'action' = does its thing on tap; 'hold' = press & hold. */
  kind: 'mode' | 'action' | 'hold';
}

/** The Studio's image tools (Phase 1), in toolbar order. */
export const TOOLS: ToolDef[] = [
  {
    id: 'removeBg',
    label: 'remove background',
    icon: IconBackground,
    kind: 'mode',
    key: 'G',
    info: 'Lifts the drawing off the paper so it can go on any colour — paper inside shapes and shadows too. On a painted background, use remove colour instead.',
  },
  {
    id: 'removeColour',
    label: 'remove colour',
    icon: IconColorPicker,
    kind: 'mode',
    key: 'C',
    info: 'Tap a colour to make it see-through, everywhere it appears. Switch on “only the patch I tap” to remove just the patch you touch — handy when the same colour is in the drawing too.',
  },
  {
    id: 'erase',
    label: 'eraser',
    icon: IconEraser,
    kind: 'mode',
    key: 'E',
    info: 'Brush away anything you don’t want. Nothing is lost for good — bring back puts it right.',
  },
  {
    id: 'restore',
    label: 'bring back',
    icon: IconBrush,
    kind: 'mode',
    key: 'B',
    info: 'Brush back anything removed by mistake. It comes back exactly as it was in the original.',
  },
  {
    id: 'seeOn',
    label: 'see it on',
    icon: IconPalette,
    kind: 'mode',
    key: 'S',
    info: 'Preview your cut-out on the colours it might be printed on — a white mug, a navy tee, kraft paper. Available once something is see-through.',
  },
  {
    id: 'background',
    label: 'background',
    icon: IconBucketDroplet,
    kind: 'mode',
    key: 'K',
    info: 'Fill the see-through parts with a colour, so it prints on that colour. Leave it see-through to let the product’s own colour show — on a card or print, see-through is white paper.',
  },
  {
    id: 'rotate',
    label: 'rotate',
    icon: IconRotateClockwise,
    kind: 'action',
    key: 'R',
    info: 'Turn it a quarter turn clockwise. Tap again to keep turning.',
  },
  {
    id: 'flip',
    label: 'flip',
    icon: IconFlipVertical,
    kind: 'mode',
    key: 'F',
    info: 'Mirror it — left to right, or top to bottom.',
  },
  {
    id: 'crop',
    label: 'crop',
    icon: IconCrop,
    kind: 'mode',
    key: 'X',
    info: 'Trim to just the part you want: drag the corners or the whole box. Great for getting the drawing big on a tee.',
  },
  {
    id: 'compare',
    label: 'compare',
    icon: IconEye,
    kind: 'hold',
    key: 'Space (hold)',
    info: 'Press and hold to see your original. It’s always kept, untouched.',
  },
  {
    id: 'startAgain',
    label: 'start again',
    icon: IconRestore,
    kind: 'action',
    info: 'Go back to your original upload and clear every edit. Your original is never changed.',
  },
];

export const toolById = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
