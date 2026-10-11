import assert from "node:assert/strict";
import test from "node:test";
import { buildTurntideSite } from "../src/turntide-software-system/site.mjs";
import { articles, pages, siteUrl } from "../src/turntide-software-system/index.mjs";

test("the static site emits canonical links, JSON-LD on the homepage, robots.txt, sitemap.xml and a self-linked feed", () => {
  const files = buildTurntideSite();
  for (const path of ["index.html", "index.jsonld", "feed.xml", "robots.txt", "sitemap.xml"]) assert.equal(files.has(path), true, path);

  const home = files.get("index.html");
  assert.ok(home.includes(`<link rel="canonical" href="${siteUrl}">`));
  assert.match(home, /<script type="application\/ld\+json">/u);

  const article = articles[0];
  const articleHtml = files.get(`posts/${article.slug}/index.html`);
  assert.ok(articleHtml.includes(`<link rel="canonical" href="${new URL(`posts/${article.slug}/`, siteUrl).href}">`));
  assert.doesNotMatch(articleHtml, /application\/ld\+json">\{/u);

  assert.equal(files.get("robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", siteUrl).href}\n`);
  const sitemap = files.get("sitemap.xml");
  for (const url of [siteUrl, ...articles.map((a) => new URL(`posts/${a.slug}/`, siteUrl).href), ...pages.map((p) => new URL(`${p.slug}/`, siteUrl).href)]) {
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), url);
  }
  assert.match(files.get("feed.xml"), /<link rel="self" href="[^"]*feed\.xml"\/>/u);
});

test("the homepage JSON-LD cannot close its script element", () => {
  const home = buildTurntideSite().get("index.html");
  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/u.exec(home);
  assert.ok(block);
  assert.equal(block[1].includes("<"), false);
  assert.doesNotThrow(() => JSON.parse(block[1]));
});
