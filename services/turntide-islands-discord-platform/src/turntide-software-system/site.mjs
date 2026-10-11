import { articles, communityName, pages, siteUrl, turntideCarrier } from "./index.mjs";

export const siteOptions = Object.freeze({
  siteUrl, websiteUrl: siteUrl, title: communityName, siteName: communityName,
  description: "Turntide Islands community and knowledge-vault surface.", author: "emsenn", language: "en",
});

function escaped(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function bodyHtml(source) {
  return source.split(/\n{2,}/u).map((block) => {
    const heading = /^(#{1,6})\s+(.+)$/u.exec(block);
    if (heading) return `<h${heading[1].length}>${escaped(heading[2])}</h${heading[1].length}>`;
    return `<p>${escaped(block).replaceAll("\n", "<br>")}</p>`;
  }).join("\n");
}
function html(title, description, body) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped(title)} · ${escaped(communityName)}</title><meta name="description" content="${escaped(description)}"></head><body><main><h1>${escaped(title)}</h1>${bodyHtml(body)}</main></body></html>\n`;
}

export function turntideStructuredData() {
  const graph = [
    { "@id": siteUrl, "@type": "WebSite", name: communityName, description: siteOptions.description, inLanguage: "en" },
    ...articles.map((article) => ({ "@id": new URL(`posts/${article.slug}/`, siteUrl).href, "@type": "Article", headline: article.title, description: article.description, datePublished: article.date, author: { "@id": new URL("people/emsenn", siteUrl).href } })),
    ...pages.map((page) => ({ "@id": new URL(`${page.slug}/`, siteUrl).href, "@type": "WebPage", name: page.title, datePublished: page.date, isPartOf: { "@id": siteUrl } })),
  ];
  return Object.freeze({ graph: Object.freeze({ "@context": "https://schema.org", "@graph": Object.freeze(graph) }) });
}

export function buildTurntideSite() {
  const structured = turntideStructuredData();
  const files = new Map();
  files.set("index.html", html(communityName, siteOptions.description, articles.map((article) => `${article.title}\n\n${article.description}`).join("\n\n")));
  for (const article of articles) files.set(`posts/${article.slug}/index.html`, html(article.title, article.description, article.body));
  for (const page of pages) files.set(`${page.slug}/index.html`, html(page.title, page.title, page.body));
  files.set("index.jsonld", `${JSON.stringify(structured.graph)}\n`);
  files.set("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><id>${escaped(siteUrl)}</id><title>${escaped(communityName)}</title>${articles.map((article) => `<entry><id>${escaped(new URL(`posts/${article.slug}/`, siteUrl).href)}</id><title>${escaped(article.title)}</title><updated>${escaped(article.date)}</updated><summary>${escaped(article.description)}</summary></entry>`).join("")}</feed>\n`);
  return files;
}

export function siteSummary() {
  const files = buildTurntideSite(), structured = turntideStructuredData(), carrier = turntideCarrier();
  return Object.freeze({ kind: "turntide-islands.site-summary", packageName: carrier.packageName, siteUrl: carrier.siteUrl,
    files: files.size, graphNodes: structured.graph["@graph"].length, lanes: carrier.orchestration.lanes.length });
}
