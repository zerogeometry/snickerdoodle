import {
  IconBackground,
  IconColorPicker,
  IconCrop,
  IconEraser,
  IconEye,
  IconFlipVertical,
  IconRestore,
  IconRotateClockwise,
  IconBrush,
  IconBucketDroplet,
  IconPencil,
  IconStack2,
  IconShape,
  IconTypography,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

export type ToolId = 'removeBg' | 'removeColour' | 'erase' | 'restore' | 'background' | 'draw' | 'text' | 'shapes' | 'select' | 'rotate' | 'flip' | 'crop' | 'compare' | 'startAgain';

export type ToolGroup = 'cut' | 'add' | 'frame' | 'colour' | 'check';
/** Toolbar groups, in order of how often parents reach for them. */
export const TOOL_GROUPS: { id: ToolGroup; label: string }[] = [
  { id: 'cut', label: 'cut out' },
  { id: 'add', label: 'add' },
  { id: 'frame', label: 'frame' },
  { id: 'colour', label: 'colour' },
  { id: 'check', label: 'check' },
];

export interface ToolDef {
  id: ToolId;
  group: ToolGroup;
  label: string;
  icon: TablerIcon;
  /** The panel header's one line: what to do with this tool. */
  hint: string;
  /** What the (i) explains — one or two warm, plain sentences. */
  info: string;
  /** Keyboard shortcut (desktop), shown in the expanded toolbar. */
  key?: string;
  /** 'mode' = stays selected (brushes, crop…); 'action' = does its thing on tap; 'hold' = press & hold. */
  kind: 'mode' | 'action' | 'hold';
}

/**
 * The Studio's tools, in toolbar order — grouped, and ordered by how likely a parent is to want
 * each edit: lift the drawing off the paper (and tidy it), add a name or a doodle, frame it, then
 * colour; checking and starting again last.
 */
export const TOOLS: ToolDef[] = [
  {
    id: 'removeBg',
    group: 'cut',
    hint: 'lifts the drawing off the paper, so it sits on any colour.',
    label: 'remove background',
    icon: IconBackground,
    kind: 'mode',
    key: 'G',
    info: 'Lifts the drawing off the paper so it can go on any colour — paper inside shapes and shadows too. On a painted background, use remove colour instead.',
  },
  {
    id: 'erase',
    group: 'cut',
    hint: 'brush over anything you don’t want.',
    label: 'eraser',
    icon: IconEraser,
    kind: 'mode',
    key: 'E',
    info: 'Brush away anything you don’t want. Nothing is lost for good — bring back puts it right.',
  },
  {
    id: 'restore',
    group: 'cut',
    hint: 'brush back anything removed — exactly as it was.',
    label: 'bring back',
    icon: IconBrush,
    kind: 'mode',
    key: 'B',
    info: 'Brush back anything removed by mistake. It comes back exactly as it was in the original.',
  },
  {
    id: 'removeColour',
    group: 'cut',
    hint: 'tap a colour to make it see-through.',
    label: 'remove colour',
    icon: IconColorPicker,
    kind: 'mode',
    key: 'C',
    info: 'Tap a colour to make it see-through, everywhere it appears. Choose “just that patch” to remove only the patch you touch — handy when the same colour is in the drawing too.',
  },
  {
    id: 'text',
    group: 'add',
    hint: 'tap the picture where you’d like words — or tap words to change them.',
    label: 'add text',
    icon: IconTypography,
    kind: 'mode',
    key: 'T',
    info: 'Tap where you’d like words — a name, a date, a little message — then type. Pick a font, size and colour.',
  },
  {
    id: 'draw',
    group: 'add',
    hint: 'draw with a finger, mouse or stylus.',
    label: 'draw',
    icon: IconPencil,
    kind: 'mode',
    key: 'P',
    info: 'Draw on top with a finger, mouse or stylus — pressing harder with a stylus makes a thicker line. Turn on “stylus only” so a resting hand doesn’t leave marks.',
  },
  {
    id: 'shapes',
    group: 'add',
    hint: 'tap a shape to add it — then drag it into place.',
    label: 'shapes',
    icon: IconShape,
    kind: 'mode',
    key: 'H',
    info: 'Add a heart, star, sun, cloud and more. Then drag to move it and use the corner to resize.',
  },
  {
    id: 'select',
    group: 'add',
    hint: 'everything you’ve added, top first — tap one to change it.',
    label: 'layers',
    icon: IconStack2,
    kind: 'mode',
    key: 'L',
    info: 'Everything you add is its own layer. Tap one — on the picture or in the list — to move it, resize it from the corner, turn it with the top handle, change it, bring it forward or send it back, or delete it.',
  },
  {
    id: 'crop',
    group: 'frame',
    hint: 'drag the corners, or drag the box to move it.',
    label: 'crop',
    icon: IconCrop,
    kind: 'mode',
    key: 'X',
    info: 'Trim to just the part you want: drag the corners or the whole box. Great for getting the drawing big on a tee.',
  },
  {
    id: 'rotate',
    group: 'frame',
    hint: 'a quarter turn clockwise.',
    label: 'rotate',
    icon: IconRotateClockwise,
    kind: 'action',
    key: 'R',
    info: 'Turn it a quarter turn clockwise. Tap again to keep turning.',
  },
  {
    id: 'flip',
    group: 'frame',
    hint: 'mirror it.',
    label: 'flip',
    icon: IconFlipVertical,
    kind: 'mode',
    key: 'F',
    info: 'Mirror it — left to right, or top to bottom.',
  },
  {
    id: 'background',
    group: 'colour',
    hint: 'fill the see-through parts with a colour.',
    label: 'background',
    icon: IconBucketDroplet,
    kind: 'mode',
    key: 'K',
    info: 'Fill the see-through parts with a colour, so it prints on that colour. Leave it see-through to let the product’s own colour show — on a card or print, see-through is white paper.',
  },
  {
    id: 'compare',
    group: 'check',
    hint: 'press and hold to see your original.',
    label: 'compare',
    icon: IconEye,
    kind: 'hold',
    key: 'Space (hold)',
    info: 'Press and hold to see your original. It’s always kept, untouched.',
  },
  {
    id: 'startAgain',
    group: 'check',
    hint: 'clear every edit.',
    label: 'start again',
    icon: IconRestore,
    kind: 'action',
    info: 'Go back to your original upload and clear every edit. Your original is never changed.',
  },
];

export const toolById = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
