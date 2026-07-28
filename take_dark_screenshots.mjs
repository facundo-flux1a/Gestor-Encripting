import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = '/home/flux1a/.gemini/antigravity/brain/1b5cf952-be2e-438b-b3e0-87f81ad13496/dark';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:9002';
const PAGES = [
  { url: '/dashboard',   name: 'dm_dashboard' },
  { url: '/documents',   name: 'dm_documents' },
  { url: '/trimestres',  name: 'dm_trimestres' },
  { url: '/incidents',   name: 'dm_incidents' },
  { url: '/proveedores', name: 'dm_proveedores' },
  { url: '/sii',         name: 'dm_sii' },
];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// First navigate to dashboard and enable dark mode
console.log('Navigating to dashboard to enable dark mode...');
await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));

// Try clicking the theme toggle (sun/moon icon)
try {
  // The toggle is usually a button with a sun or moon icon in the header
  const toggled = await page.evaluate(() => {
    // Try multiple selectors for the theme toggle
    const selectors = [
      'button[aria-label*="theme"]',
      'button[aria-label*="dark"]',
      'button[aria-label*="light"]',
      'button[aria-label*="modo"]',
      '[data-testid="theme-toggle"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { el.click(); return sel; }
    }
    // Fallback: find button containing sun/moon SVG in header area
    const buttons = [...document.querySelectorAll('button')];
    const themeBtn = buttons.find(b => {
      const svg = b.querySelector('svg');
      const text = b.textContent || '';
      const label = b.getAttribute('aria-label') || '';
      return svg && (label.includes('☀') || label.includes('🌙') || 
                     b.className.includes('theme') || b.className.includes('dark') ||
                     b.className.includes('mode'));
    });
    if (themeBtn) { themeBtn.click(); return 'fallback-svg-btn'; }
    return null;
  });
  console.log('Theme toggle result:', toggled);
} catch(e) {
  console.log('Toggle error:', e.message);
}

// Also try: look for the ☀️ button near top right
try {
  await page.evaluate(() => {
    // Look for sun emoji or moon button
    const allBtns = [...document.querySelectorAll('button')];
    for (const b of allBtns) {
      const inner = b.innerHTML;
      if (inner.includes('Sun') || inner.includes('Moon') || 
          b.getAttribute('aria-label')?.toLowerCase().includes('theme')) {
        b.click();
        break;
      }
    }
  });
} catch(e) {}

await new Promise(r => setTimeout(r, 1000));

// Check if dark mode is on by checking body/html class or data attribute
const isDark = await page.evaluate(() => {
  return document.documentElement.classList.contains('dark') ||
         document.body.classList.contains('dark') ||
         document.documentElement.getAttribute('data-theme') === 'dark';
});
console.log('Dark mode detected:', isDark);

// If not dark, try clicking the sun icon button (the one that switches TO dark)
if (!isDark) {
  try {
    // Look for any button that when hovered shows "dark" or has brightness icon
    await page.evaluate(() => {
      // shadcn uses next-themes, typically adds class 'dark' to html
      // Try forcing dark mode via localStorage
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    console.log('Forced dark mode via localStorage');
  } catch(e) {
    console.log('Force dark error:', e.message);
  }
}

// Now take screenshots of each page
for (const { url, name } of PAGES) {
  console.log(`📸 ${name}...`);
  await page.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  const path = join(OUT, name + '.png');
  await page.screenshot({ path, fullPage: false });
  console.log(`   ✅ Saved: ${path}`);
}

await browser.close();
console.log('\n✅ All dark mode screenshots done!');
