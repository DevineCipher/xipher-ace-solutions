# Xipher Ace Solutions — website

Static site for Xipher Ace Solutions (factory & business automation, Karachi).
Live: https://devinecipher.github.io/xipher-ace-solutions/

## Pages
`index.html` · `services.html` · `case-study.html` · `process.html` · `contact.html` · `404.html`

## Files
- `style.css` — all styles
- `site.js` — mobile menu
- `hero3d.js`, `case3d.js` — Three.js scenes (fall back to SVG/CSS when WebGL is missing)
- `og-image.png` — link preview for WhatsApp / Facebook / LinkedIn
- `sitemap.xml`, `robots.txt`, `site.webmanifest`, icons

## SEO checklist when something changes
- Each page has its own `<title>`, meta description, canonical URL, Open Graph tags and JSON-LD (business, breadcrumbs, services, FAQ, article).
- If you move to a custom domain, replace `https://devinecipher.github.io/xipher-ace-solutions/` in every page head, `sitemap.xml` and `robots.txt`.
- Update `<lastmod>` in `sitemap.xml` when a page changes.
- Pricing is never shown on the site — quotes go through WhatsApp (0332 3425964).
