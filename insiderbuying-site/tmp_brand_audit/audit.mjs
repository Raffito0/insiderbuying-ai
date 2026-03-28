import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = process.env.AUDIT_URL || 'http://localhost:3000';
const PAGES = [
  '/',
  '/about',
  '/alerts',
  '/blog',
  '/contact',
  '/faq',
  '/free-report',
  '/how-it-works',
  '/methodology',
  '/pricing',
  '/privacy',
  '/reports',
  '/terms',
];

async function extractStyles(page, pageName) {
  return page.evaluate((pName) => {
    const results = {
      page: pName,
      fonts: {},
      colors: { text: {}, bg: {}, border: {} },
      fontSizes: {},
      fontWeights: {},
      lineHeights: {},
      letterSpacings: {},
      paddings: {},
      margins: {},
      gaps: {},
      borderRadii: {},
      headings: [],
      buttons: [],
      sections: [],
      containers: [],
    };

    // Collect all visible elements
    const allElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button, li, td, th, label, input, textarea, div, section, main, header, footer, nav');

    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const cs = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();

      // Font family
      const ff = cs.fontFamily;
      results.fonts[ff] = (results.fonts[ff] || 0) + 1;

      // Font size
      const fs = cs.fontSize;
      results.fontSizes[fs] = (results.fontSizes[fs] || 0) + 1;

      // Font weight
      const fw = cs.fontWeight;
      results.fontWeights[fw] = (results.fontWeights[fw] || 0) + 1;

      // Line height
      const lh = cs.lineHeight;
      results.lineHeights[lh] = (results.lineHeights[lh] || 0) + 1;

      // Letter spacing
      const ls = cs.letterSpacing;
      if (ls !== 'normal') {
        results.letterSpacings[ls] = (results.letterSpacings[ls] || 0) + 1;
      }

      // Colors
      const textColor = cs.color;
      results.colors.text[textColor] = (results.colors.text[textColor] || 0) + 1;

      const bgColor = cs.backgroundColor;
      if (bgColor !== 'rgba(0, 0, 0, 0)') {
        results.colors.bg[bgColor] = (results.colors.bg[bgColor] || 0) + 1;
      }

      const borderColor = cs.borderColor;
      if (cs.borderWidth !== '0px') {
        results.colors.border[borderColor] = (results.colors.border[borderColor] || 0) + 1;
      }

      // Border radius
      const br = cs.borderRadius;
      if (br !== '0px') {
        results.borderRadii[br] = (results.borderRadii[br] || 0) + 1;
      }

      // Headings detail
      if (/^h[1-6]$/.test(tag)) {
        results.headings.push({
          tag,
          text: el.textContent.trim().slice(0, 80),
          fontSize: fs,
          fontWeight: fw,
          fontFamily: ff.split(',')[0].replace(/['"]/g, '').trim(),
          color: textColor,
          lineHeight: lh,
          letterSpacing: ls,
          marginBottom: cs.marginBottom,
          marginTop: cs.marginTop,
        });
      }

      // Buttons
      if (tag === 'button' || (tag === 'a' && el.classList.length > 0 && (el.textContent.trim().length < 40))) {
        const classes = el.className || '';
        if (classes.includes('btn') || classes.includes('button') || classes.includes('cta') ||
            cs.cursor === 'pointer' && bgColor !== 'rgba(0, 0, 0, 0)' && tag === 'button') {
          results.buttons.push({
            text: el.textContent.trim().slice(0, 40),
            fontSize: fs,
            fontWeight: fw,
            bgColor,
            textColor,
            borderRadius: br,
            padding: cs.padding,
            fontFamily: ff.split(',')[0].replace(/['"]/g, '').trim(),
          });
        }
      }

      // Sections and containers
      if ((tag === 'section' || tag === 'div') && rect.width > 300 && rect.height > 100) {
        const padding = cs.padding;
        const gap = cs.gap;
        if (padding !== '0px' || bgColor !== 'rgba(0, 0, 0, 0)') {
          const entry = {
            tag,
            width: Math.round(rect.width),
            bgColor,
            padding,
            gap: gap !== 'normal' ? gap : undefined,
            borderRadius: br !== '0px' ? br : undefined,
            border: cs.borderWidth !== '0px' ? `${cs.borderWidth} ${cs.borderStyle} ${borderColor}` : undefined,
          };
          if (tag === 'section') results.sections.push(entry);
          else results.containers.push(entry);
        }
      }
    }

    // Sort and limit containers/sections
    results.containers = results.containers.slice(0, 50);
    results.sections = results.sections.slice(0, 30);

    return results;
  }, pageName);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const allData = [];

  for (const path of PAGES) {
    const pageName = path === '/' ? 'home' : path.replace('/', '');
    console.log(`Auditing: ${pageName}...`);

    const page = await context.newPage();

    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      // Full page screenshot
      await page.screenshot({
        path: `tmp_brand_audit/${pageName}.png`,
        fullPage: true,
      });

      // Also mobile screenshot
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `tmp_brand_audit/${pageName}_mobile.png`,
        fullPage: true,
      });

      // Reset to desktop for style extraction
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(500);

      // Extract styles
      const styles = await extractStyles(page, pageName);
      allData.push(styles);

      console.log(`  Done: ${styles.headings.length} headings, ${styles.buttons.length} buttons, ${styles.sections.length} sections`);
    } catch (err) {
      console.error(`  Error on ${pageName}: ${err.message}`);
    }

    await page.close();
  }

  // Write full audit data
  writeFileSync('tmp_brand_audit/audit_data.json', JSON.stringify(allData, null, 2));

  // Generate summary report
  const summary = generateSummary(allData);
  writeFileSync('tmp_brand_audit/audit_summary.md', summary);

  console.log('\nAudit complete! See tmp_brand_audit/audit_summary.md');
  await browser.close();
}

function generateSummary(allData) {
  // Aggregate across all pages
  const agg = {
    fonts: {}, fontSizes: {}, fontWeights: {}, lineHeights: {},
    textColors: {}, bgColors: {}, borderColors: {}, borderRadii: {},
    letterSpacings: {},
  };

  for (const d of allData) {
    for (const [k, v] of Object.entries(d.fonts)) agg.fonts[k] = (agg.fonts[k] || 0) + v;
    for (const [k, v] of Object.entries(d.fontSizes)) agg.fontSizes[k] = (agg.fontSizes[k] || 0) + v;
    for (const [k, v] of Object.entries(d.fontWeights)) agg.fontWeights[k] = (agg.fontWeights[k] || 0) + v;
    for (const [k, v] of Object.entries(d.lineHeights)) agg.lineHeights[k] = (agg.lineHeights[k] || 0) + v;
    for (const [k, v] of Object.entries(d.colors.text)) agg.textColors[k] = (agg.textColors[k] || 0) + v;
    for (const [k, v] of Object.entries(d.colors.bg)) agg.bgColors[k] = (agg.bgColors[k] || 0) + v;
    for (const [k, v] of Object.entries(d.colors.border)) agg.borderColors[k] = (agg.borderColors[k] || 0) + v;
    for (const [k, v] of Object.entries(d.borderRadii)) agg.borderRadii[k] = (agg.borderRadii[k] || 0) + v;
    for (const [k, v] of Object.entries(d.letterSpacings)) agg.letterSpacings[k] = (agg.letterSpacings[k] || 0) + v;
  }

  const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

  let md = `# EarlyInsider.com Brand Consistency Audit\n\n`;
  md += `Audited ${allData.length} pages on ${new Date().toISOString().split('T')[0]}\n\n`;

  // Fonts
  md += `## Font Families (${Object.keys(agg.fonts).length} unique)\n\n`;
  for (const [k, v] of sortDesc(agg.fonts).slice(0, 15)) {
    md += `- \`${k.slice(0, 80)}\` — ${v} elements\n`;
  }

  // Font sizes
  md += `\n## Font Sizes (${Object.keys(agg.fontSizes).length} unique)\n\n`;
  for (const [k, v] of sortDesc(agg.fontSizes).slice(0, 25)) {
    md += `- \`${k}\` — ${v} elements\n`;
  }

  // Font weights
  md += `\n## Font Weights (${Object.keys(agg.fontWeights).length} unique)\n\n`;
  for (const [k, v] of sortDesc(agg.fontWeights)) {
    md += `- \`${k}\` — ${v} elements\n`;
  }

  // Text colors
  md += `\n## Text Colors (${Object.keys(agg.textColors).length} unique)\n\n`;
  for (const [k, v] of sortDesc(agg.textColors).slice(0, 20)) {
    md += `- \`${k}\` — ${v} elements\n`;
  }

  // Background colors
  md += `\n## Background Colors (${Object.keys(agg.bgColors).length} unique)\n\n`;
  for (const [k, v] of sortDesc(agg.bgColors).slice(0, 20)) {
    md += `- \`${k}\` — ${v} elements\n`;
  }

  // Border colors
  md += `\n## Border Colors (${Object.keys(agg.borderColors).length} unique)\n\n`;
  for (const [k, v] of sortDesc(agg.borderColors).slice(0, 15)) {
    md += `- \`${k}\` — ${v} elements\n`;
  }

  // Border radii
  md += `\n## Border Radii (${Object.keys(agg.borderRadii).length} unique)\n\n`;
  for (const [k, v] of sortDesc(agg.borderRadii).slice(0, 15)) {
    md += `- \`${k}\` — ${v} elements\n`;
  }

  // Letter spacings
  md += `\n## Letter Spacings (${Object.keys(agg.letterSpacings).length} unique)\n\n`;
  for (const [k, v] of sortDesc(agg.letterSpacings).slice(0, 10)) {
    md += `- \`${k}\` — ${v} elements\n`;
  }

  // Per-page heading analysis
  md += `\n## Heading Styles Per Page\n\n`;
  for (const d of allData) {
    if (d.headings.length === 0) continue;
    md += `### ${d.page}\n\n`;
    md += `| Tag | Text | Size | Weight | Font | Color | Line-H | Margin-B |\n`;
    md += `|-----|------|------|--------|------|-------|--------|----------|\n`;
    for (const h of d.headings.slice(0, 15)) {
      md += `| ${h.tag} | ${h.text.slice(0, 35)} | ${h.fontSize} | ${h.fontWeight} | ${h.fontFamily} | ${h.color} | ${h.lineHeight} | ${h.marginBottom} |\n`;
    }
    md += '\n';
  }

  // Per-page button analysis
  md += `\n## Button Styles Per Page\n\n`;
  for (const d of allData) {
    if (d.buttons.length === 0) continue;
    md += `### ${d.page}\n\n`;
    md += `| Text | Size | Weight | BG | Color | Radius | Padding | Font |\n`;
    md += `|------|------|--------|----|-------|--------|---------|------|\n`;
    for (const b of d.buttons.slice(0, 10)) {
      md += `| ${b.text.slice(0, 25)} | ${b.fontSize} | ${b.fontWeight} | ${b.bgColor} | ${b.textColor} | ${b.borderRadius} | ${b.padding} | ${b.fontFamily} |\n`;
    }
    md += '\n';
  }

  // Per-page section backgrounds
  md += `\n## Section Backgrounds Per Page\n\n`;
  for (const d of allData) {
    if (d.sections.length === 0) continue;
    md += `### ${d.page}\n\n`;
    for (const s of d.sections.slice(0, 10)) {
      md += `- BG: \`${s.bgColor}\` | Padding: \`${s.padding}\` | Radius: \`${s.borderRadius || 'none'}\`${s.border ? ` | Border: \`${s.border}\`` : ''}\n`;
    }
    md += '\n';
  }

  return md;
}

main().catch(console.error);
