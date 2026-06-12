const { chromium } = require('playwright');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Seite wird gerendert (2x Retina-Auflösung)...');

  const browser = await chromium.launch({
    args: ['--force-color-profile=srgb']
  });

  // 2x deviceScaleFactor = 3024px breiter Screenshot, Retina-scharf
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1676, height: 982 });

  await page.goto('http://localhost:8080/startseite-vorschlag.html', {
    waitUntil: 'networkidle'
  });

  // Animationen deaktivieren, alle Elemente sichtbar
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation-duration:  0s !important;
      transition-duration: 0s !important;
    }
    .fade-up, [class*="fade"] {
      opacity:   1 !important;
      transform: none !important;
    }
    * { background-attachment: scroll !important; }
  `});

  await page.waitForTimeout(2000);

  // Scrollen damit alle Bilder laden
  await page.evaluate(async () => {
    const max = document.body.scrollHeight;
    for (let y = 0; y <= max; y += 150) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });

  await page.waitForTimeout(2000);

  // PNG Screenshot — verlustfrei, exakt wie Browser
  const png = await page.screenshot({ fullPage: true, type: 'png' });
  await browser.close();

  const meta = await sharp(png).metadata();
  console.log(`Screenshot: ${meta.width} x ${meta.height}px (${(png.length/1024/1024).toFixed(1)} MB PNG)`);

  // JPEG 96% — visuell identisch, viel kleiner
  console.log('Komprimiere...');
  const jpeg = await sharp(png)
    .jpeg({ quality: 96, mozjpeg: true })
    .toBuffer();
  console.log(`Komprimiert: ${(jpeg.length/1024/1024).toFixed(1)} MB JPEG`);

  // PDF-Seite auf 1300pt setzen — screenshot bei 1676px gemacht,
  // also 3352/1300 = 2.58x Retina-Qualität, passt gut in PDF-Viewer
  const displayWidth  = 1300;
  const displayHeight = Math.round(meta.height * (1300 / meta.width));

  const pdfDoc = await PDFDocument.create();
  const img = await pdfDoc.embedJpg(jpeg);
  const pdfPage = pdfDoc.addPage([displayWidth, displayHeight]);
  pdfPage.drawImage(img, {
    x: 0, y: 0,
    width:  displayWidth,
    height: displayHeight,
  });

  const pdfBytes = await pdfDoc.save();
  const outPath = path.resolve(__dirname, 'nina-koller-vorschau.pdf');
  fs.writeFileSync(outPath, pdfBytes);

  const mb = (pdfBytes.length / 1024 / 1024).toFixed(1);
  console.log(`\n✓ PDF gespeichert: nina-koller-vorschau.pdf`);
  console.log(`  ${mb} MB  |  Anzeige: ${displayWidth} x ${Math.round(displayHeight)}px  |  2x Retina-scharf`);
})();
