// Convert the existing official vector logo into the raster asset embedded by jsPDF.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 3 });
  const svg = await readFile('public/house-of-training.svg', 'utf8');
  await page.setContent(`<style>body{margin:0;background:white}svg{width:318px;height:100px;display:block}</style>${svg}`);
  await page.locator('svg').screenshot({ path: 'public/house-of-training-pdf.png' });
} finally { await browser.close(); }
