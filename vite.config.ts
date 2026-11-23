import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Share previews (Open Graph / X cards) need the image's full web address. Set VITE_SITE_URL
 * when building for a live site (e.g. https://jayfox.design/lab/halftone-studio); without it
 * the tags fall back to a relative path.
 */
function seoTags(site: string): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Halftone Studio",
    description:
      "Shape a 3D ribbon of halftone dots by dragging markers, then export real vector SVG or PNG. Free, no sign-up, runs in your browser.",
    applicationCategory: "DesignApplication",
    operatingSystem: "Any (runs in a web browser)",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "Jay Fox", url: "https://jayfox.design" },
    isPartOf: { "@type": "CollectionPage", name: "Lab", url: "https://jayfox.design/lab" },
    sameAs: "https://github.com/jalex929/halftone-studio",
    license: "https://opensource.org/licenses/MIT",
  };
  return [
    `<link rel="canonical" href="${site}/" />`,
    `<script type="application/ld+json">${JSON.stringify({ ...schema, url: `${site}/`, image: `${site}/og-image.png` })}</script>`,
  ].join("\n    ");
}

function shareTags(): Plugin {
  const site = process.env.VITE_SITE_URL?.replace(/\/+$/, "");
  return {
    name: "share-tags",
    transformIndexHtml: (html) =>
      html
        .replaceAll("%SHARE_IMAGE%", site ? `${site}/og-image.png` : "./og-image.png")
        .replace("%SHARE_URL_TAG%", site ? `<meta property="og:url" content="${site}/" />` : "")
        .replace("%SEO_TAGS%", site ? seoTags(site) : ""),
  };
}

// Plain Vite config so any host (Bolt, StackBlitz, Netlify, a laptop) can start it as is.
export default defineConfig({
  // Relative base so the build works at /, /lab/halftone-studio/ or anywhere else.
  base: "./",
  plugins: [react(), shareTags()],
});
