# SEO + AEO: the FAQ and what crawlers see (23 Oct 2026)

## What shipped
- **/faq**, linked first in the footer. 32 questions in 6 groups (About · Products and prices · Your drawing and
  print quality · Ordering, delivery and returns · Gifts and family · Privacy and safety). Content: `src/lib/faq.ts`.
- **robots.txt** (`src/app/robots.ts`): public marketing pages open to every crawler, AI search + answer engines
  named explicitly; every family page (keepsakes, studio, basket, gift links, account, API) closed. The
  password-locked test site is closed to everything. Decided per request, never frozen at build.
- **sitemap.xml** (`src/app/sitemap.ts`): the 10 public pages; empty on the test site.
- **Site-wide**: `metadataBase` (canonical links resolve to the real domain), Open Graph defaults (en_GB).
  The FAQ has its own canonical, title and description.

## How it's built for answer engines (and why)
- **Questions phrased as people ask them** ("Can I put my child's drawing on a phone case?"), each a real heading.
- **Answer-first**: every answer opens with ONE self-contained sentence that names Snickerdoodle, so an engine can
  quote it on its own and still be right; detail follows. 15–90 words each. (Unit-tested.)
- **Specific, checkable facts**: live prices from the catalogue (never typed in twice), materials, sizes, UK-only
  delivery, the 30-day deletion rule, 14-day gift links. Every claim was checked against the code and the
  privacy notice / family promise / terms — the FAQ never promises more than they do.
- **Plain, server-rendered HTML** (native `<details>`, so answers are in the page even when collapsed).
- **FAQPage + Organization structured data**, generated from the same list (an e2e checks they match). Google stopped
  showing FAQ rich results in May 2026, but the markup is still read and other engines use it.
- **A visible "last updated" date** and `dateModified`.
- **Brand rules kept**: warm and plain; "AI" only in the one privacy question (no training on children's pictures),
  matching the family promise.

## Founder calls
1. **Model-training crawlers** (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta) are currently
   ALLOWED on the public pages only — more reach in assistants' own knowledge; the pages hold nothing private.
   To keep them out of training but stay in AI search: one line in `src/lib/seo.ts`.
2. **Before launch** (all off-site, all yours): verify the domain in Google Search Console + Bing Webmaster Tools
   (Bing feeds ChatGPT search) and submit `https://snickerdoodle.co.uk/sitemap.xml`; a Google Business Profile;
   consistent name/description on socials + any directories; genuine mentions (parenting blogs, gift guides,
   Mumsnet threads) — engines lean on corroboration across the web, which no page can fake.
3. Fill the trust pages' placeholders (company number, address, contact email) — the FAQ links to them.

## Sources (23 Oct 2026)
- Answer-first structure, question headings, schema matching visible content, crawler access:
  [ALM Corp](https://almcorp.com/blog/answer-engine-optimization-2026/),
  [Frase](https://www.frase.io/blog/what-is-answer-engine-optimization-the-complete-guide-to-getting-cited-by-ai),
  [Rankwyre](https://rankwyre.com/blog/answer-engine-optimization-get-cited-by-ai),
  [Bigeye](https://www.bigeyeagency.com/insights/answer-engine-optimization-the-complete-guide-to-getting-your-brand-cited-by-ai-in-2026)
  (vendor sources — the structure advice is consistent; their percentages are unverified).
- FAQ rich results ended May 2026; markup still harmless/useful elsewhere:
  [Priority Pixels](https://prioritypixels.co.uk/insights/google-ends-faq-rich-results-in-search/),
  [PPC Land](https://ppc.land/google-kills-faq-rich-results-what-seos-saw-coming-since-2019/).
- robots.txt is the lever; llms.txt shows no measurable effect (so we didn't add one):
  [PPC Land](https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/),
  [Hyperleap](https://hyperleap.ai/blog/top-llm-crawlers-and-what-they-do-2026).
