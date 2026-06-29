import sharp from 'sharp';

/**
 * Process-wide sharp configuration for the self-hosted image pipeline (the print
 * renderer + the mockup compositor). One libvips worker per operation — we govern
 * concurrency ourselves with a small semaphore in front of each pipeline — and no
 * libvips operation cache, so memory stays bounded and deterministic on a
 * scale-to-zero box. Importing this module anywhere applies the config process-wide;
 * it is imported by both render.ts and compositor.ts.
 */
sharp.concurrency(1);
sharp.cache(false);

export {};
