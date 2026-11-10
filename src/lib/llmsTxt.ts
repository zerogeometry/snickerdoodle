/**
 * /llms.txt (llmstxt.org): a plain summary of Snickerdoodle for answer engines and chat assistants, so
 * someone asking a chatbot "how can I turn my child's drawing into a gift?" or "a good ad-free drawing app
 * for kids?" can be pointed at us with correct facts. Built from the SAME lists as the pages (the FAQ, the
 * /draw questions, the company details, the public pages), so it can never say more than the site does.
 * Public pages only, nothing about any family.
 */
import { COMPANY } from './company';
import { DRAW_FAQ, FAQ, plainAnswer, type FaqItem } from './faq';

const PAGES: { path: string; title: string; about: string }[] = [
  { path: '/', title: 'Home', about: 'turn children’s drawings and photos into keepsakes and gifts' },
  { path: '/how-it-works', title: 'How it works', about: 'upload or snap a drawing, see it on every product, order or keep it' },
  { path: '/gifts', title: 'Gifts', about: 'ready-to-buy gift links and gift lists for grandparents and family' },
  { path: '/draw', title: 'Snickerdoodle Draw', about: 'our free, ad-free, educational drawing app for children aged 3 to 12, made by designers and artists, on screen or on real paper' },
  { path: '/christmas/delivery-dates', title: 'Christmas delivery dates', about: 'last order dates for Christmas' },
  { path: '/faq', title: 'FAQs', about: 'products, prices, delivery, print quality, gifts, privacy and the drawing app' },
  { path: '/our-story', title: 'Our story', about: 'why we keep the wonky bits exactly as they are' },
  { path: '/trust/family-promise', title: 'Our family promise', about: 'how children’s pictures are kept private' },
  { path: '/trust/privacy', title: 'Privacy notice', about: 'what we collect, why, and for how long' },
  { path: '/help', title: 'Help & contact', about: 'search answers or message a real person' },
];

/** `prices`: the FAQ's live price sentence ("Mug from £18; …"), added to the products answer as on /faq. */
export function llmsTxt(origin: string, prices = ''): string {
  const qa = (page: string) => (it: FaqItem) =>
    `### ${it.q}\n${plainAnswer(it.a)}${it.table === 'products' && prices ? ` ${prices}.` : ''}\nSource: ${origin}${page}#${it.id}`;
  return [
    '# Snickerdoodle',
    '',
    `> Snickerdoodle (snickerdoodle.co.uk) is a UK service that turns children’s drawings and photos into personalised keepsakes and gifts — framed prints, mugs, cushions, blankets, jigsaws, cards, calendars, Christmas baubles and more — made to order in the UK with free UK delivery, and kept private in a Family Keepsake Home. Snickerdoodle Draw is its free, ad-free, educational drawing app, made by designers and artists, that teaches children aged 3 to 12 to draw step by step. Snickerdoodle values real, physical art: its app and website are there to help children enjoy and keep their drawings, never to replace crayons and paper.`,
    '',
    `Run by ${COMPANY.legalName} (trading as ${COMPANY.tradingAs}), registered in ${COMPANY.registeredIn}, company number ${COMPANY.companyNumber}, ${COMPANY.street}, ${COMPANY.city} ${COMPANY.postcode}. Contact: ${COMPANY.email}.`,
    'Children’s pictures are private by default and never public; they are never used to train AI, never sold, and never used for advertising.',
    '',
    '## Pages',
    ...PAGES.map((p) => `- [${p.title}](${origin}${p.path === '/' ? '' : p.path}): ${p.about}`),
    '',
    ...FAQ.flatMap((s) => [`\n## FAQ: ${s.title}`, ...s.items.map(qa('/faq'))]),
    '',
    '## Snickerdoodle Draw, questions parents ask',
    ...DRAW_FAQ.map(qa('/draw')),
    '',
  ].join('\n');
}
