// divination-infographic.mts — renders the day's raw astrology-and-moon
// numbers as a fixed-layout PNG, with nothing else on it: no interpretation,
// no lection, no LLM-authored text. sky-desk's daily-report-publication duty
// posts this alongside a separate LISS-authored text report; this module
// answers only for the numbers card.
//
// Palette follows the firm's dataviz method for a dark stat-card (see
// dataviz skill, references/palette.md): surface #1a1a19, primary text
// #ffffff, secondary text #c3c2b7, sun accent gold (categorical slot 4,
// dark step #c98500), moon accent blue (categorical slot 1, dark step
// #3987e5) — a static PNG carries no light/dark toggle, so one fixed dark
// surface is chosen rather than a theme-reactive pair. Aspects are
// classified by their own fixed geometry (trine/sextile are the harmonic
// "soft" angles, square/opposition the dissonant "hard" ones — a mechanical
// fact about the exact angle, not a reading of what the day means) and
// colored from the palette's fixed status pair (good/serious), always with
// a direct text label alongside the color per the palette's own mitigation
// rule for a CVD-risky pair.
//
// Body/aspect names are plain text, deliberately: a headless deploy box has
// no guarantee of a font covering the Unicode astrological/planetary glyph
// block or emoji, and this card has to render correctly on whatever box it
// ships to. FONT_FAMILY below picks the first installed sans face from a
// preference list (via @napi-rs/canvas's own GlobalFonts, backed by
// fontconfig) rather than the bare CSS keyword "sans-serif", which this
// engine does not reliably resolve to an actual sans face — on a box with
// none of the preferred names installed it falls back to that keyword.

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

const WIDTH = 900;
const HEIGHT = 680;
const MARGIN = 48;

const SURFACE = "#1a1a19";
const SURFACE_RAISED = "#242422";
const TEXT_PRIMARY = "#ffffff";
const TEXT_SECONDARY = "#c3c2b7";
const TEXT_MUTED = "#898781";
const SUN_ACCENT = "#c98500";
const MOON_ACCENT = "#3987e5";
const RULE = "#3a3a37";
const STATUS_GOOD = "#0ca30c";
const STATUS_SERIOUS = "#ec835a";

const SIGN_ORDER = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const SIGN_ABBR = ["ARI", "TAU", "GEM", "CAN", "LEO", "VIR", "LIB", "SCO", "SAG", "CAP", "AQU", "PSC"];

const SOFT_ASPECTS = new Set(["trine", "sextile"]);
const HARD_ASPECTS = new Set(["square", "opposition"]);

const FONT_FAMILY = (() => {
  for (const name of ["Inter", "Helvetica", "Arial", "Liberation Sans", "DejaVu Sans", "Noto Sans"]) {
    if (GlobalFonts.has(name)) return name;
  }
  return "sans-serif";
})();

function font(spec) {
  return `${spec} "${FONT_FAMILY}"`;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function degreeLabel(degreeInSign) {
  const whole = Math.floor(degreeInSign);
  const minutes = Math.round((degreeInSign - whole) * 60);
  return minutes === 60 ? `${whole + 1}°00'` : `${whole}°${String(minutes).padStart(2, "0")}'`;
}

function eclipticLongitude(placement) {
  const index = SIGN_ORDER.indexOf(placement.sign.name);
  return index < 0 ? undefined : index * 30 + placement.degreeInSign;
}

function aspectClass(aspect) {
  const lower = aspect.toLowerCase();
  if (SOFT_ASPECTS.has(lower)) return "soft";
  if (HARD_ASPECTS.has(lower)) return "hard";
  return undefined;
}

function drawColumnHeader(ctx, x, y, label, accent) {
  ctx.fillStyle = accent;
  ctx.font = font("600 22px");
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, x, y);
}

// A 12-segment ecliptic strip with downward-pointing (sun) and
// upward-pointing (moon) triangle markers at each body's exact longitude —
// the same degree numbers the columns below state in words, drawn as a
// position rather than only read as one.
function drawEclipticStrip(
  ctx,
  y,
  sunLongitude,
  moonLongitude,
) {
  const stripX = MARGIN;
  const stripW = WIDTH - MARGIN * 2;
  const stripH = 26;
  const segW = stripW / 12;

  for (let i = 0; i < 12; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? SURFACE_RAISED : SURFACE;
    ctx.fillRect(stripX + i * segW, y, segW, stripH);
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = font("11px");
    ctx.textAlign = "center";
    ctx.fillText(SIGN_ABBR[i], stripX + i * segW + segW / 2, y + stripH + 16);
  }
  ctx.textAlign = "left";
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.strokeRect(stripX, y, stripW, stripH);

  const drawMarker = (longitude, accent, above) => {
    const x = stripX + (longitude / 360) * stripW;
    const tipY = above ? y - 3 : y + stripH + 3;
    const baseY = above ? tipY - 8 : tipY + 8;
    ctx.beginPath();
    ctx.moveTo(x, tipY);
    ctx.lineTo(x - 5, baseY);
    ctx.lineTo(x + 5, baseY);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
  };
  if (sunLongitude !== undefined) drawMarker(sunLongitude, SUN_ACCENT, true);
  if (moonLongitude !== undefined) drawMarker(moonLongitude, MOON_ACCENT, false);
}

// An 8-phase icon keyed off the phase name Divination's ephemeris module
// already emits (new/waxing crescent/first quarter/waxing gibbous/full/
// waning gibbous/last quarter/waning crescent) — discrete geometry per
// named phase rather than a continuous formula, so it can't render a
// mismatched sliver on an edge case.
function drawMoonPhaseIcon(ctx, cx, cy, r, phase) {
  const LIT = "#f4f1e8";
  const DARK = "#2c2c2a";
  const p = phase.toLowerCase();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = DARK;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  if (p.includes("full")) {
    ctx.fillStyle = LIT;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  } else if (p.includes("first quarter")) {
    ctx.fillStyle = LIT;
    ctx.fillRect(cx, cy - r, r, r * 2);
  } else if (p.includes("last quarter")) {
    ctx.fillStyle = LIT;
    ctx.fillRect(cx - r, cy - r, r, r * 2);
  } else if (p.includes("waxing crescent") || p.includes("waning crescent")) {
    const onRight = p.includes("waxing");
    ctx.fillStyle = LIT;
    ctx.beginPath();
    ctx.ellipse(cx + (onRight ? r * 0.55 : -r * 0.55), cy, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.includes("waxing gibbous") || p.includes("waning gibbous")) {
    const onRight = p.includes("waxing");
    ctx.fillStyle = LIT;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = DARK;
    ctx.beginPath();
    ctx.ellipse(cx + (onRight ? -r * 0.55 : r * 0.55), cy, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // an unrecognized phase name is left as the plain dark disc — no guessed shape
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export async function renderDivinationInfographic(
  numbers,
  options,
) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font("600 16px");
  ctx.fillText("TURNTIDE ISLANDS · SKY REPORT", MARGIN, 52);
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = font("600 30px");
  ctx.fillText(options.date, MARGIN, 92);

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 116);
  ctx.lineTo(WIDTH - MARGIN, 116);
  ctx.stroke();

  // Ecliptic position strip
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font("600 16px");
  ctx.fillText("ECLIPTIC POSITION", MARGIN, 150);
  drawEclipticStrip(
    ctx,
    162,
    eclipticLongitude(numbers.astrology.sun),
    eclipticLongitude(numbers.astrology.moon),
  );

  ctx.strokeStyle = RULE;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 230);
  ctx.lineTo(WIDTH - MARGIN, 230);
  ctx.stroke();

  // Sun column
  const sunX = MARGIN;
  const moonX = WIDTH / 2 + 24;
  const columnY = 266;

  drawColumnHeader(ctx, sunX, columnY, "SUN", SUN_ACCENT);
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = font("700 48px");
  ctx.fillText(numbers.astrology.sun.sign.name, sunX, columnY + 56);
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font("24px");
  ctx.fillText(degreeLabel(numbers.astrology.sun.degreeInSign), sunX, columnY + 88);

  // Moon column
  drawColumnHeader(ctx, moonX, columnY, "MOON", MOON_ACCENT);
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = font("700 48px");
  ctx.fillText(numbers.astrology.moon.sign.name, moonX, columnY + 56);
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font("24px");
  ctx.fillText(degreeLabel(numbers.astrology.moon.degreeInSign), moonX, columnY + 88);

  // Moon phase icon + label, its own row under the moon column
  const phaseIconR = 22;
  const phaseIconCx = moonX + phaseIconR;
  const phaseIconCy = columnY + 148 - phaseIconR + 6;
  drawMoonPhaseIcon(ctx, phaseIconCx, phaseIconCy, phaseIconR, numbers.moon.phase);
  const phaseTextX = moonX + phaseIconR * 2 + 18;
  const phaseY = columnY + 148;
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = font("600 26px");
  ctx.fillText(titleCase(numbers.moon.phase), phaseTextX, phaseY);
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font("20px");
  const illuminatedPct = Math.round(numbers.moon.illuminatedFraction * 100);
  ctx.fillText(`${illuminatedPct}% illuminated, ${numbers.moon.trend}`, phaseTextX, phaseY + 28);

  ctx.strokeStyle = RULE;
  ctx.beginPath();
  ctx.moveTo(MARGIN, columnY + 200);
  ctx.lineTo(WIDTH - MARGIN, columnY + 200);
  ctx.stroke();

  // Aspects
  const aspectsY = columnY + 236;
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font("600 16px");
  ctx.fillText("MAJOR ASPECTS", MARGIN, aspectsY);
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = font("13px");
  ctx.textAlign = "right";
  ctx.fillText("soft = harmonic angle · hard = dissonant angle, by geometry alone", WIDTH - MARGIN, aspectsY);
  ctx.textAlign = "left";

  const rowHeight = 46;
  const rowsPerColumn = 2;
  const maxRows = Math.min(numbers.aspects.length, rowsPerColumn * 2);
  const columnSplit = maxRows > rowsPerColumn;
  for (let i = 0; i < maxRows; i += 1) {
    const hit = numbers.aspects[i];
    const col = columnSplit ? Math.floor(i / rowsPerColumn) : 0;
    const row = columnSplit ? i % rowsPerColumn : i;
    const x = MARGIN + col * ((WIDTH - MARGIN * 2) / (columnSplit ? 2 : 1));
    const y = aspectsY + 34 + row * rowHeight;

    const cls = aspectClass(hit.aspect);
    const statusColor = cls === "soft" ? STATUS_GOOD : cls === "hard" ? STATUS_SERIOUS : undefined;
    if (statusColor !== undefined) {
      ctx.beginPath();
      ctx.arc(x - 10, y - 6, 4, 0, Math.PI * 2);
      ctx.fillStyle = statusColor;
      ctx.fill();
    }

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = font("20px");
    ctx.fillText(`${titleCase(hit.bodyA)} ${hit.aspect} ${titleCase(hit.bodyB)}`, x, y);

    ctx.fillStyle = statusColor ?? TEXT_SECONDARY;
    ctx.font = font("15px");
    const suffix = cls === undefined ? "" : ` · ${cls}`;
    ctx.fillText(`${Math.abs(hit.offset).toFixed(1)}° ${hit.phase}${suffix}`, x, y + 20);
  }
  if (numbers.aspects.length > maxRows) {
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = font("16px");
    ctx.fillText(
      `+${numbers.aspects.length - maxRows} more in the full reading`,
      MARGIN,
      aspectsY + 34 + (rowsPerColumn - 1) * rowHeight + 40,
    );
  }
  if (numbers.aspects.length === 0) {
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = font("18px");
    ctx.fillText("no major aspects within orb today", MARGIN, aspectsY + 34);
  }

  // Footer (two lines — the single-line sentence overflows the canvas width)
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = font("14px");
  ctx.fillText("raw numbers only, contracted from Divination — sun/moon accurate to 0.02°, low-precision ephemeris.", MARGIN, HEIGHT - 36);
  ctx.fillText("see the companion report for what they mean.", MARGIN, HEIGHT - 16);

  return canvas.toBuffer("image/png");
}
