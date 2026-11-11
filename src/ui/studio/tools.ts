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
  IconChristmasTree,
  IconTypography,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

export type ToolId = 'removeBg' | 'removeColour' | 'erase' | 'restore' | 'background' | 'draw' | 'text' | 'shapes' | 'christmas' | 'select' | 'rotate' | 'flip' | 'crop' | 'compare' | 'startAgain';

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
  /** A small ✕ on the icon, top-right (founder, 22 Oct): the two "take away" tools — remove
   * background and the remove-colour pipette — aren't self-explanatory without it. */
  badge?: 'tr';
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
    badge: 'tr',
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
    badge: 'tr',
    kind: 'mode',
    key: 'C',
    info: 'Tap a colour to make it see-through, everywhere it appears. Choose “just that patch” to remove only the patch you touch — handy when the same colour is in the drawing too.',
  },
  {
    id: 'text',
    group: 'add',
    hint: 'tap the picture where you’d like words, then type — tap words to change them, drag to move.',
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
    // Christmas season only (src/lib/season.ts) — hidden the rest of the year
    id: 'christmas',
    group: 'add',
    hint: 'tap a sticker to add it — or holly tape, a gold frame or snow.',
    label: 'christmas',
    icon: IconChristmasTree,
    kind: 'mode',
    key: 'J',
    info: 'The Christmas drawer: a family of stickers to add — then move, size, turn or flip them — plus holly tape, a gold frame and a flurry of snow in one tap. Each is its own layer. Your drawing underneath is never changed.',
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
    hint: 'turn it to any angle — it clicks into place at every 45°.',
    label: 'rotate',
    icon: IconRotateClockwise,
    kind: 'mode',
    key: 'R',
    info: 'Turn the whole design to any angle, to a tenth of a degree — handy for straightening a wonky photo. Drag on the picture or use the slider; it clicks gently into place at every 45°. Words and shapes turn with it.',
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

/**
 * "fewer tools" / "all tools" (founder, 11 Nov). Fewer is the default: the everyday edits — lift it
 * off the paper, take a colour away, rub a smudge out, add a name, a festive touch, a background
 * colour — and they fit one row on a phone with no swiping. "all tools" adds the rest. Compare and
 * start again are safety actions: never hidden by the choice. The choice is remembered per device.
 */
export type ToolSet = 'fewer' | 'all';
export const TOOL_SET_KEY = 'snickerdoodle.studio.tool-set';

/** A photo or drawing: the everyday edits. Bring back is one tap away inside eraser + remove background. */
export const FEWER_TOOLS: readonly ToolId[] = ['removeBg', 'removeColour', 'erase', 'text', 'christmas', 'background'];
/** A blank canvas has nothing to cut out — drawing and shapes are its everyday tools. */
export const FEWER_TOOLS_BLANK: readonly ToolId[] = ['draw', 'text', 'shapes', 'christmas', 'background'];
/** Shown whatever the choice. */
export const SAFETY_TOOLS: readonly ToolId[] = ['compare', 'startAgain'];

/** Tools a design already USES — so a design with drawing, shapes or stickers opens with them reachable. */
export function toolsInUse(objects: readonly { type: string }[]): ToolId[] {
  const out = new Set<ToolId>();
  for (const o of objects) {
    if (o.type === 'stroke') out.add('draw');
    if (o.type === 'shape') out.add('shapes');
    // anything but words is moved / sized / turned in layers (words are changed with add text)
    if (o.type !== 'text') out.add('select');
  }
  return [...out];
}

/**
 * Which tools the toolbar shows. `reach` = tools that must be on show even with fewer tools: the one
 * in use, ones opened by a shortcut or a "switch to" button, and the ones the design already uses.
 */
export function shownTools(set: ToolSet, { scratch, reach = [] }: { scratch: boolean; reach?: readonly (ToolId | null | undefined)[] }): Set<ToolId> {
  if (set === 'all') return new Set(TOOLS.map((t) => t.id));
  return new Set<ToolId>([...(scratch ? FEWER_TOOLS_BLANK : FEWER_TOOLS), ...SAFETY_TOOLS, ...reach.filter((t): t is ToolId => !!t)]);
}

export function readToolSet(): ToolSet {
  try {
    return localStorage.getItem(TOOL_SET_KEY) === 'all' ? 'all' : 'fewer';
  } catch {
    return 'fewer'; // private mode / storage blocked
  }
}
export function storeToolSet(set: ToolSet): void {
  try {
    localStorage.setItem(TOOL_SET_KEY, set);
  } catch {
    /* fine — it just isn't remembered */
  }
}
