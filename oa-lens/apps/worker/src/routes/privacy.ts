import { Hono } from 'hono';
import type { AppEnv } from '../env';

// Privacy policy for the Chrome Web Store listing. Public (no shared key), plain HTML.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>OA Lens privacy policy</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#111}</style>
</head><body>
<h1>OA Lens privacy policy</h1>
<p>OA Lens is a private Chrome extension used by its owner for their own Amazon selling business.</p>
<h2>What it reads</h2>
<p>On amazon.com product pages it reads the product ID (ASIN), title and the "bought in past month" text.</p>
<h2>Where data goes</h2>
<p>The ASIN is sent only to the owner's own Cloudflare Worker, which asks Amazon's Selling Partner API and Keepa for
product, offer, fee and restriction data. Buy costs the owner types are stored in the owner's Cloudflare D1 database.
Settings and the Worker address are stored in Chrome storage (synced through the owner's Google account).</p>
<h2>What it does not do</h2>
<p>It does not collect browsing history, personal information or payment data, does not sell or share data with
anyone, and does not use data for advertising or credit decisions.</p>
<p>Contact: the extension owner.</p>
</body></html>`;

export const privacyRoutes = new Hono<AppEnv>().get('/', (c) => c.html(PAGE));
