/**
 * The FAQ (founder, 23 Oct): written for families first, and built so search engines AND answer
 * engines (AI Overviews, ChatGPT, Perplexity, Claude…) can lift a clean, correct answer:
 *  - every question is phrased the way people actually ask it;
 *  - every answer OPENS with a one-sentence, self-contained answer that names Snickerdoodle (it may be
 *    quoted on its own), then the detail;
 *  - facts are specific and true to the product + our policies (privacy notice, family promise,
 *    terms) — nothing here may promise more than they do;
 *  - the page's structured data (FAQPage) is generated from THIS list, so it always matches what's
 *    on screen.
 * Answers are plain text; `[label](/path)` makes an internal link. Brand rules apply: warm, plain,
 * no corporate tone, no pushy upsell, no "AI" as a feature (it appears only where the privacy promise
 * talks about it — never training on children's pictures).
 */
import { COMPANY } from './company';
import { storeHref } from './drawApp';
import { CHRISTMAS_LAST_ORDER } from './season';

/** "coming to" until a store link is set in src/lib/drawApp.ts, then "on" — the FAQ never claims a download that isn't live. */
const DRAW_STORES_LIVE = storeHref('appStore') !== null || storeHref('googlePlay') !== null;
const DRAW_WHERE = DRAW_STORES_LIVE ? 'on the App Store and Google Play' : 'coming soon to the App Store and Google Play';

/** "Monday 14 December" from the season's last-order table — the FAQ never types a date twice. */
export function longDate(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(Y, M - 1, D, 12)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
const XMAS = CHRISTMAS_LAST_ORDER[2026]!.byRoute;

export interface FaqItem {
  id: string;
  q: string;
  /** Plain text. The FIRST sentence must stand alone as the answer. */
  a: string;
  /** Show the live product + price table under this answer. */
  table?: 'products';
}
export interface FaqSection {
  id: string;
  title: string;
  items: FaqItem[];
}

/** When the answers were last checked against the product + policies (shown, and in the schema). */
export const FAQ_UPDATED = '2026-11-10';

/** Friendly names for the price table — every product in the shop needs one (unit-tested). */
export const FAQ_PRODUCT_NAMES: Record<string, string> = {
  framedPrint: 'Framed print',
  multiPhotoFrame: 'Multi photo frame (9, 24 or 60 drawings)',
  mug: 'Mug',
  cushion: 'Cushion (square, round or heart)',
  kidsTee: 'Kids’ organic T-shirt',
  adultTee: 'Adult organic T-shirt',
  jigsaw: 'Jigsaw puzzle',
  blanket: 'Fleece blanket',
  card: 'Greetings card',
  cardPack: 'Pack of greetings cards (5 or 10)',
  calendar: '2027 wall calendar (A5 or A4)',
  phoneCase: 'Phone case',
  socks: 'Socks',
  heightChart: 'Height chart',
  wrappingPaper: 'Wrapping paper (roll)',
  teaTowel: 'Tea towel',
  playingCards: 'Playing cards',
  ceramicOrnament: 'Ceramic christmas ornament',
  christmasBauble: 'Christmas bauble (plastic ball)',
  sack: 'Christmas sack',
  placemat: 'Placemats (set of 4)',
  coaster: 'Coasters (packs of 2, 4 or 6)',
  christmasBundle: 'Christmas family bundle (a set for 2, 4 or 8, from £78)',
  kidsJumper: 'Kids’ organic jumper',
  christmasJumper: 'Christmas jumper (adult)',
  watchStrap: 'Apple Watch strap',
};

export const FAQ: FaqSection[] = [
  {
    id: 'about',
    title: 'About Snickerdoodle',
    items: [
      {
        id: 'what-is-snickerdoodle',
        q: 'What is Snickerdoodle?',
        a: 'Snickerdoodle is a UK service that turns your child’s drawings and photos into personalised keepsakes and gifts — framed prints, mugs, cushions, jigsaws, blankets, cards, phone cases, socks and more — and keeps them safe in a private Family Keepsake Home. The wonky bits stay exactly as they are: we keep the magic, we don’t redraw it. Read [our story](/our-story).',
      },
      {
        id: 'how-does-it-work',
        q: 'How does Snickerdoodle work?',
        a: 'With Snickerdoodle you upload or snap a photo of a drawing, see it on a whole range of products in moments, then order the ones you love or keep the drawing safe for later. You can tidy it up in the studio first — lift it off the paper, crop it, add a name — and place it exactly where you want it. See [how it works](/how-it-works).',
      },
      {
        id: 'need-an-account',
        q: 'Do I need an account to try Snickerdoodle?',
        a: 'No — you can try Snickerdoodle without an account: upload a drawing and see it on every product straight away. You only need a quick sign-up (an email link, no password) to order or to keep a drawing in your Keepsake Home. Drafts you don’t keep are deleted automatically within 30 days.',
      },
      {
        id: 'is-it-free',
        q: 'Is Snickerdoodle free to use?',
        a: 'Yes, Snickerdoodle is free to try: uploading, previewing and editing your child’s drawing costs nothing. You only pay for the products you order, and UK delivery is included in every price.',
      },
      {
        id: 'keep-childrens-artwork',
        q: 'What’s the best way to keep my child’s artwork?',
        a: 'Snickerdoodle is a simple way to keep your child’s artwork: snap a photo of each drawing and keep it in your private Family Keepsake Home, so the paper can go without losing the memory. The original photo is always kept untouched, you can share it with family privately, and you can turn favourites into framed prints, multi photo frames or calendars.',
      },
      {
        id: 'uk-company',
        q: 'Is Snickerdoodle a UK company?',
        a: `Yes — Snickerdoodle is run by ${COMPANY.legalName}, a company registered in ${COMPANY.registeredIn} (company number ${COMPANY.companyNumber}), based in ${COMPANY.city}. Everything is made to order in the UK, children’s pictures are held in private UK storage, and UK delivery is free on every order.`,
      },
      {
        id: 'who-is-it-for',
        q: 'Who is Snickerdoodle for?',
        a: 'Snickerdoodle is for parents and guardians who want to keep their children’s artwork, and for the grandparents, aunts, uncles and friends who love giving it back as a present. It’s for grown-ups to use: children never have accounts, and only a parent or guardian decides who sees what.',
      },
      {
        id: 'contact',
        q: 'How do I contact Snickerdoodle?',
        a: 'The quickest way to reach Snickerdoodle is the [help page](/help): search our answers first, and if you still need us, pick a topic and send a message — a real person replies by email. For anything else, write to hello@snickerdoodle.co.uk.',
      },
    ],
  },
  {
    id: 'products',
    title: 'Products and prices',
    items: [
      {
        id: 'what-can-i-make',
        q: 'What can I turn my child’s drawing into, and how much does it cost?',
        a: 'Snickerdoodle prints children’s drawings onto framed prints, multi photo frames, mugs, cushions, jigsaws, fleece blankets, organic T-shirts and jumpers, greetings cards, 2027 calendars, phone cases, Apple Watch straps, socks, coasters, placemats, wrapping paper, tea towels, height charts, playing cards and Christmas baubles, with free UK delivery included in every price. Here’s what each starts from:',
        table: 'products',
      },
      {
        id: 'multi-photo-frame',
        q: 'Can I put lots of my child’s drawings in one frame?',
        a: 'Yes — the Snickerdoodle multi photo frame holds a neat grid of 9, 24 or 60 of your child’s drawings in one frame, so a whole year of artwork can hang on the wall together. You pick drawings from your Keepsake Home or upload new ones, and any square you leave empty repeats your main drawing.',
      },
      {
        id: 'calendar',
        q: 'Can I make a calendar from my child’s drawings?',
        a: 'Yes — the Snickerdoodle 2027 wall calendar puts a different one of your child’s drawings on every month, in A5 or A4. It makes a lovely present for grandparents, who get a new drawing to look at all year.',
      },
      {
        id: 'phone-case',
        q: 'Can I put my child’s drawing on a phone case?',
        a: 'Yes — Snickerdoodle prints your child’s drawing edge to edge on a phone case for dozens of iPhone, Samsung Galaxy and Google Pixel models. Choose a slim snap case or a tough case with a cushioned lining, in gloss or matte, and the drawing fills the back of the case — a wide drawing turns to fit, reading the right way up when the phone is held sideways — and you can move or resize it before you order.',
      },
      {
        id: 'socks-wrapping-paper',
        q: 'Can I make socks, wrapping paper or a tea towel from my child’s drawing?',
        a: 'Yes — on socks, wrapping paper and tea towels Snickerdoodle turns the drawing into a cheerful repeating pattern, and you choose how big the drawings are and what colour they sit on. Socks come as ankle or tube styles (one size, UK 6–10); wrapping paper comes on a 70cm-wide roll of 2, 3 or 5 metres.',
      },
      {
        id: 'background-colour',
        q: 'Can I choose the background colour?',
        a: 'Yes — Snickerdoodle lets you pick any colour on a colour wheel to fill the background behind the drawing, on every product printed edge to edge: phone cases, cushions, blankets, jigsaws, framed prints, cards, playing cards, socks, wrapping paper and tea towels. If the drawing is still on its paper, one tap lifts it off so it sits right on your colour.',
      },
      {
        id: 'cards',
        q: 'Can I make greetings cards from my child’s drawings?',
        a: 'Yes — Snickerdoodle prints your child’s drawing on the front of a folded 7×5″ card on premium 330gsm Fedrigoni stock, with an envelope included. A single card can carry a printed message inside, or you can buy packs of 5 or 10 with a different drawing on every card, blank inside for your own words.',
      },
      {
        id: 'add-name-message',
        q: 'Can I add my child’s name, a date or a message?',
        a: 'Yes — in the Snickerdoodle studio you can add words in a choice of handwriting-style fonts, plus doodles and shapes, right on the picture. We only ever ask for a child’s first name, never a surname.',
      },
      {
        id: 'height-chart',
        q: 'How does the Snickerdoodle height chart work?',
        a: 'The Snickerdoodle height chart is a canvas on wooden hangers with your child’s drawing running beside a printed ruler in centimetres and feet and inches. Hang it with the bottom edge 40 cm off the floor and it reads true from 50 cm up — so you can mark every birthday as they grow past it.',
      },
    ],
  },
  {
    id: 'christmas',
    title: 'Christmas',
    items: [
      {
        id: 'christmas-last-order',
        q: 'What’s the last day to order from Snickerdoodle for Christmas?',
        a: `Snickerdoodle’s last day to order for Christmas 2026 is ${longDate(XMAS.uk9)} for most things, including baubles, sacks, mugs, tea towels and T-shirts. Cards and card packs close earlier, on ${longDate(XMAS.uk7)}, and wrapping paper on ${longDate(XMAS.gb2)}. These are safe dates with time to make and post everything; every date is on [our Christmas dates page](/christmas/delivery-dates).`,
      },
      {
        id: 'christmas-bauble',
        q: 'Can I turn my child’s drawing into a Christmas bauble?',
        a: 'Yes — Snickerdoodle prints your child’s drawing on a bauble for the tree, as a glossy ceramic disc or a shatterproof plastic ball printed all the way round. Lots of families make a new one every Christmas, so the tree fills up with a timeline of their drawings. Made in the UK; see [how it works](/how-it-works).',
      },
      {
        id: 'christmas-grandparents',
        q: 'What’s a good Christmas present for grandparents from a toddler?',
        a: 'Snickerdoodle’s most-loved present for grandparents is something with the grandchild’s own drawing on it — a bauble, a mug, a tea towel or the 2027 calendar with a different drawing each month. You can also send them a private ready-to-buy link so they can choose for themselves. See [gifts](/gifts).',
      },
      {
        id: 'christmas-cards-wrap',
        q: 'Can I make Christmas cards and wrapping paper from my child’s drawing?',
        a: 'Yes — Snickerdoodle makes Christmas cards in packs of 5 or 10 with a different drawing on each front, and wrapping paper with their drawing as a repeating pattern, on white or brown kraft paper. The inside of the cards is left blank for your own message. Cards close for Christmas a few days before everything else.',
      },
      {
        id: 'christmas-same-parcel',
        q: 'Do I save anything if I order a few things together?',
        a: 'Yes — Snickerdoodle takes £3 off each extra item that’s made and packed in the same parcel, because posting them together costs us less (a bauble and a mug, or two rolls of wrapping paper). Many products also say “buy more & save”: more of the same thing costs up to 15% less each. Both happen automatically at checkout. We don’t run Black Friday discounts.',
      },
    ],
  },
  {
    id: 'quality',
    title: 'Your drawing and print quality',
    items: [
      {
        id: 'best-photo',
        q: 'What kind of drawing or photo works best?',
        a: 'Any drawing works — crayon, paint, pencil or felt tip — and a photo from your phone is all Snickerdoodle needs. For the crispest result, snap it flat in daylight, fill the frame with the drawing, and avoid shadows across the paper.',
      },
      {
        id: 'print-quality',
        q: 'Will a phone photo print sharply?',
        a: 'Snickerdoodle checks the sharpness of your drawing against the exact size of every product and tells you before you order if it would print soft. It points you to the sizes that will print sharply, and it never silently prints something blurry.',
      },
      {
        id: 'remove-background',
        q: 'Can you remove the paper background from my child’s drawing?',
        a: 'Yes — one tap in the Snickerdoodle studio lifts the drawing off its paper, so it can sit on any colour or product. If you still need to fine-tune it, you can remove specific colours and use the eraser. It can keep the white inside shapes (the whites of eyes, a snowman, a cloud), and you can brush back anything you want to keep.',
      },
      {
        id: 'change-drawing',
        q: 'Will you change or redraw my child’s drawing?',
        a: 'No — Snickerdoodle never redraws your child’s work: the wonky bits stay, because that’s the good bit. Any tidying is your choice — crop it, straighten it, lift it off the paper, rub out a smudge — and your original upload is always kept untouched, so you can go back to it any time.',
      },
      {
        id: 'from-scratch',
        q: 'Can I design something from scratch?',
        a: 'Yes — Snickerdoodle has a blank canvas (square, tall or wide) where you or your child can draw, add words and shapes, and pick a background colour, then put it on any product. And if they’d rather use crayons, paint and paper, snap the drawing and it works just the same.',
      },
    ],
  },
  {
    id: 'ordering',
    title: 'Ordering, delivery and returns',
    items: [
      {
        id: 'where-made',
        q: 'Where are Snickerdoodle products made?',
        a: 'Snickerdoodle products are printed to order in the UK by specialist print partners, one at a time, for your family. Nothing is mass-produced or waiting in a warehouse — each piece is made after you order it.',
      },
      {
        id: 'delivery-cost',
        q: 'How much is delivery, and is it tracked?',
        a: 'Delivery is free on every Snickerdoodle order to a UK address — it’s included in the price. Most products are sent tracked — the link is in your “on its way” email and on your orders page; greetings cards, card packs, wrapping paper and playing cards travel by standard post, which isn’t tracked.',
      },
      {
        id: 'international',
        q: 'Does Snickerdoodle deliver outside the UK?',
        a: 'Not yet — Snickerdoodle currently delivers to addresses in the United Kingdom only, with free delivery included in every price. If you live abroad, you can still order a keepsake to send to someone at a UK address.',
      },
      {
        id: 'returns',
        q: 'Can I return a personalised item?',
        a: 'Because every Snickerdoodle piece is made especially for you, personalised items can’t be returned just for a change of mind — but your statutory rights are unaffected, so if anything arrives faulty or damaged we’ll put it right. See our [terms](/trust/terms).',
      },
      {
        id: 'change-order',
        q: 'Can I change or cancel my order?',
        a: 'Snickerdoodle makes every order specially and it goes into production quickly, so we can’t promise a change once it’s placed — but message us as soon as you can, choosing “Change or cancel an order” on our [contact form](/help#contact) and including your order reference, and we’ll do everything we can. Your order reference is on your orders page and in your order email.',
      },
      {
        id: 'payment',
        q: 'How do I pay, and is it secure?',
        a: 'You pay by card through our secure payment provider, and Snickerdoodle never sees or stores your full card details. Prices are in pounds sterling and are confirmed at checkout.',
      },
    ],
  },
  {
    id: 'gifts',
    title: 'Gifts and family',
    items: [
      {
        id: 'gifts-from-drawing',
        q: 'What personalised gifts can be made from a child’s drawing?',
        a: 'Snickerdoodle turns a child’s drawing into personalised gifts like mugs, framed prints, cushions, fleece blankets, jigsaws, T-shirts, 2027 calendars and Christmas baubles, each made to order in the UK with free delivery. You see the drawing on every product before you buy, and grandparents can be sent a private ready-to-buy link. See [gifts](/gifts).',
      },
      {
        id: 'grandparents-buy',
        q: 'How can grandparents buy something with my child’s drawing?',
        a: 'With Snickerdoodle you pick the pieces and share one ready-to-buy link — by WhatsApp, text or email — and grandparents tap it to find the basket already filled. They can check out as a guest in under a minute, or join the family and save 5%. See [gifts](/gifts).',
      },
      {
        id: 'gift-list',
        q: 'What is a Snickerdoodle gift list?',
        a: 'A Snickerdoodle gift list is a private wishlist of keepsakes made from your child’s drawings that you can share with family before a birthday or Christmas. Each item is ticked off once it’s bought, so nobody doubles up, and you can switch the list off whenever you like.',
      },
      {
        id: 'gift-link-private',
        q: 'Are gift links private?',
        a: 'Yes — every Snickerdoodle gift link is private, unguessable and never shown to search engines, and it expires after 14 days. You can switch a link off at any time, and only the people you send it to can open it.',
      },
      {
        id: 'invite-family',
        q: 'Can I invite family to see my child’s keepsakes?',
        a: 'Yes — only a parent or guardian can invite family to a Snickerdoodle Keepsake Home, and you choose what each person can see and do: just look, buy, or add to it. You can change or remove anyone’s access at any time, and it takes effect straight away.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy and safety',
    items: [
      {
        id: 'is-it-private',
        q: 'Is my child’s artwork private on Snickerdoodle?',
        a: 'Yes — everything on Snickerdoodle is private by default and nothing is ever public: there are no public profiles, no feeds and no sharing unless you choose it. Keepsakes start as family-only, pictures are held in private UK storage, and they’re only ever shown through short-lived private links. Read [our family promise](/trust/family-promise).',
      },
      {
        id: 'ai-training',
        q: 'Does Snickerdoodle use my child’s drawings to train AI?',
        a: 'No — Snickerdoodle never uses your child’s drawings or photos to train AI, and the suppliers who help make your products are contractually forbidden from keeping your images or using them to teach any AI. Your child’s drawing makes your product, and nothing else.',
      },
      {
        id: 'how-long-kept',
        q: 'How long does Snickerdoodle keep my child’s pictures?',
        a: 'Snickerdoodle keeps an uploaded drawing or photo only as long as it takes to make and send your order, plus 30 days in case anything needs reprinting — then it’s deleted, unless you choose to keep it in your Keepsake Home. Drafts you never keep are deleted within 30 days. Details are in our [privacy notice](/trust/privacy).',
      },
      {
        id: 'delete-download',
        q: 'Can I delete or download my child’s pictures?',
        a: 'Yes — from your Snickerdoodle account you can see, download or delete anything about your child at any time, in one place. A deletion is real: it’s gone from our live systems straight away and from our backups within 14 days.',
      },
      {
        id: 'sell-data',
        q: 'Does Snickerdoodle sell my data or show ads to children?',
        a: 'No — Snickerdoodle never sells your data, never shares it with other families, and never profiles children or uses their data for advertising. Location data is stripped from every upload.',
      },
      {
        id: 'childrens-code',
        q: 'Is Snickerdoodle designed around children’s privacy law?',
        a: 'Yes — Snickerdoodle is designed in line with the UK Information Commissioner’s Children’s Code, so everything about your child is handled to a higher standard than the law’s minimum. Every upload also goes through automated safety checks before anything can be printed.',
      },
      {
        id: 'paused-picture',
        q: 'Why has Snickerdoodle paused my picture?',
        a: 'Snickerdoodle pauses a picture when its automatic safety check spots something that might not be right for a keepsake, like rude words or grown-up content. A paused picture isn’t printed, shared or shown to your family. Sometimes the check gets it wrong, so we take a closer look; meanwhile you can carry on with another picture.',
      },
    ],
  },
  {
    id: 'draw-app',
    title: 'Snickerdoodle Draw, our drawing app',
    items: [
      {
        id: 'drawing-app',
        q: 'What’s a good ad-free drawing app for children?',
        a: `Snickerdoodle Draw is a free, ad-free educational app, made by Snickerdoodle’s designers and artists, that teaches children aged 3 to 12 to draw step by step, on screen or on real paper with crayons. It has no in-app purchases and no chat, reads every step aloud, works offline, and is ${DRAW_WHERE} for iPhone, iPad and Android. See [Snickerdoodle Draw](/draw).`,
      },
      {
        id: 'draw-app-keepsakes',
        q: 'Can drawings from Snickerdoodle Draw become keepsakes?',
        a: 'Yes — a drawing your child makes on paper with Snickerdoodle Draw can come straight to Snickerdoodle: snap it, keep it in your private Keepsake Home, and turn it into a print, mug or card. Linking the app to your Snickerdoodle account is coming soon, so their proudest drawings can arrive in your keepsake box on their own.',
      },
      {
        id: 'draw-app-data',
        q: 'Does Snickerdoodle Draw collect my child’s data?',
        a: 'No — Snickerdoodle Draw keeps your child’s drawings on the device, with no sign-up, no ads, no chat and no tracking. Nothing leaves the app unless a grown-up chooses to send it, and anything like that sits in a grown-ups’ corner, opened with the phone’s own lock or a PIN. Crash reports stay off unless you switch them on.',
      },
    ],
  },
];

/**
 * The /draw page's questions (founder, 10 Nov): the ones parents ask about a children's drawing app, in the
 * same pattern as the FAQ (each answer opens with a self-contained sentence naming Snickerdoodle Draw), and
 * true to the app's store listing (snickerdoodle-draw docs/store/google-play-listing.md). FAQPage structured
 * data on /draw is generated from this list. Unit-tested with the FAQ's rules.
 */
export const DRAW_FAQ: FaqItem[] = [
  {
    id: 'what-is-snickerdoodle-draw',
    q: 'What is Snickerdoodle Draw?',
    a: 'Snickerdoodle Draw is a free, educational app that teaches children aged 3 to 12 to draw, one friendly step at a time, on screen or on real paper with crayons. It’s made in the UK by the designers and artists behind Snickerdoodle, for learning as much as for doodling. A warm voice reads every step aloud, and each finished drawing appears in a frame with your child’s name and the date.',
  },
  {
    id: 'draw-age',
    q: 'What age is Snickerdoodle Draw for?',
    a: 'Snickerdoodle Draw is for children aged 3 to 12, and the lessons grow with them. Little ones get chunky shapes, a guide to trace and every step read aloud, and start on paper by default; older children get a faint guide they can switch off, and real skills like shading, faces and people in motion.',
  },
  {
    id: 'draw-free-ads',
    q: 'Is Snickerdoodle Draw free, and does it have ads?',
    a: 'Snickerdoodle Draw is free, with no ads and no in-app purchases, so there’s nothing to buy and nothing selling to your child. If you’d like to turn a drawing into a keepsake, a grown-up does that on the Snickerdoodle website.',
  },
  {
    id: 'draw-paper',
    q: 'Can my child use Snickerdoodle Draw with real crayons and paper?',
    a: 'Yes — every Snickerdoodle Draw lesson works on screen or on real paper, with crayons, pencils, pens or paint, and a quick photo at the end adds the drawing to their gallery. We value real, physical art, and the app is there to support it, never to replace it; the youngest start on paper by default, because it’s good for small hands.',
  },
  {
    id: 'draw-offline',
    q: 'Does Snickerdoodle Draw need an account or the internet?',
    a: 'No — Snickerdoodle Draw needs no sign-up and works offline. Lessons, narration and drawings all live on the device, which makes it good for car journeys and holidays. The only time it goes online is a quiet check for app updates, and crash reports if a grown-up chooses to share them.',
  },
  {
    id: 'draw-safe',
    q: 'Is Snickerdoodle Draw safe and private for children?',
    a: 'Yes — Snickerdoodle Draw has no chat, no social feed, no ads and no sign-up, and your child’s drawings stay on the device. Settings, reminders and anything that leaves the app sit in a grown-ups’ corner, opened with your phone’s own lock or a PIN, and crash reports stay off unless a grown-up switches them on.',
  },
  {
    id: 'draw-streaks',
    q: 'Does Snickerdoodle Draw use streaks or nag children to play?',
    a: 'No — Snickerdoodle Draw counts drawing weeks, not daily streaks, so a week off is simply a rest week and nothing ever counts down to zero. There are no “don’t lose your streak” alerts, and reminders are off unless a grown-up turns them on.',
  },
  {
    id: 'draw-lessons',
    q: 'What will my child learn with Snickerdoodle Draw?',
    a: 'Snickerdoodle Draw has 366 step-by-step lessons across six worlds: Doodle Garden, Shape Friends, Story Corner, Pattern & Colour Studio, Light & Space and Character Lab. Designed by artists and designers, they start with dots, circles and lines and build real skills up to characters, patterns, shading and faces, and every lesson ends with a step to make the drawing their own.',
  },
  {
    id: 'draw-devices',
    q: 'Which devices and languages does Snickerdoodle Draw work on?',
    a: `Snickerdoodle Draw is ${DRAW_WHERE}, for iPhone, iPad and Android phones and tablets. It speaks 15 languages, including English, Spanish, French, German, Greek, Polish, Ukrainian, Chinese, Japanese and Korean; the narrator reads in English, and other languages use the phone’s own voice.`,
  },
  {
    id: 'draw-keepsakes',
    q: 'Can I turn Snickerdoodle Draw drawings into keepsakes?',
    a: 'Yes — paper drawings from Snickerdoodle Draw can go straight onto Snickerdoodle: snap one, keep it in your private Keepsake Home, and make it into a framed print, mug, cushion or card. Linking the app to your Snickerdoodle account is coming soon, so their proudest drawings can reach your keepsake box on their own. See [how it works](/how-it-works).',
  },
];

/** `[label](/path)` → its label (for the structured data and any plain-text use). */
export const plainAnswer = (a: string): string => a.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '$1');
