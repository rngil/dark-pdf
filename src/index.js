import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename, extname, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const _require = createRequire(import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(dirname(_require.resolve('pdfjs-dist/package.json')), 'legacy', 'build', 'pdf.worker.mjs')
).href;

export const THEMES = {
  classic:  { r: 0,  g: 0,  b: 0,  name: 'Classic' },
  claude:   { r: 42, g: 37, b: 34, name: 'Claude Warm' },
  chatgpt:  { r: 52, g: 53, b: 65, name: 'ChatGPT Cool' },
  sepia:    { r: 40, g: 35, b: 25, name: 'Sepia Dark' },
  midnight: { r: 25, g: 30, b: 45, name: 'Midnight Blue' },
  forest:   { r: 25, g: 35, b: 30, name: 'Forest Green' },
};

// TOC tools
async function resolveDestPage(dest, pdfDoc) {
  if (!dest) return null;
  let d = dest;
  if (typeof d === 'string') {
    try { d = await pdfDoc.getDestination(d); } catch { return null; }
  }
  if (!Array.isArray(d) || !d[0]) return null;
  try { return await pdfDoc.getPageIndex(d[0]); } catch { return null; }
}

export async function extractOutline(pdfDoc) {
  let raw;
  try { raw = await pdfDoc.getOutline(); } catch { return null; }
  if (!raw?.length) return null;

  async function walk(items) {
    const out = [];
    for (const item of items) {
      out.push({
        title: item.title ?? '',
        pageIndex: await resolveDestPage(item.dest, pdfDoc),
        items: item.items?.length ? await walk(item.items) : [],
      });
    }
    return out;
  }
  return walk(raw);
}


export function applyOutline(pdfDoc, outline) {
  if (!outline?.length) return;
  const { context } = pdfDoc;
  const pages = pdfDoc.getPages();

  function alloc(items) {
    return items.map(item => ({
      item,
      ref: context.nextRef(),
      kids: item.items?.length ? alloc(item.items) : [],
    }));
  }

  function fill(nodes, parentRef) {
    for (let i = 0; i < nodes.length; i++) {
      const { item, ref, kids } = nodes[i];
      const dict = PDFDict.withContext(context);

      dict.set(PDFName.of('Title'), PDFHexString.fromText(item.title));
      dict.set(PDFName.of('Parent'), parentRef);
      if (i > 0)                dict.set(PDFName.of('Prev'), nodes[i - 1].ref);
      if (i < nodes.length - 1) dict.set(PDFName.of('Next'), nodes[i + 1].ref);

      const pi = item.pageIndex;
      if (pi != null && pi >= 0 && pi < pages.length) {
        const dest = PDFArray.withContext(context);
        dest.push(pages[pi].ref);
        dest.push(PDFName.of('Fit'));
        dict.set(PDFName.of('Dest'), dest);
      }

      if (kids.length) {
        fill(kids, ref);
        dict.set(PDFName.of('First'), kids[0].ref);
        dict.set(PDFName.of('Last'),  kids[kids.length - 1].ref);
        dict.set(PDFName.of('Count'), PDFNumber.of(-kids.length));
      }

      context.assign(ref, dict);
    }
  }

  const rootRef = context.nextRef();
  const nodes   = alloc(outline);
  fill(nodes, rootRef);

  const root = PDFDict.withContext(context);
  root.set(PDFName.of('Type'),  PDFName.of('Outlines'));
  root.set(PDFName.of('First'), nodes[0].ref);
  root.set(PDFName.of('Last'),  nodes[nodes.length - 1].ref);
  root.set(PDFName.of('Count'), PDFNumber.of(outline.length));
  context.assign(rootRef, root);

  pdfDoc.catalog.set(PDFName.of('Outlines'), rootRef);
}

// Core func
export async function convert(inputPath, {
  theme: themeName = 'claude',
  output,
  scale = 3,
  onProgress,
} = {}) {
  const theme = THEMES[themeName];
  if (!theme) throw new Error(`Unknown theme "${themeName}". Available: ${Object.keys(THEMES).join(', ')}`);

  const rawBuf = await readFile(inputPath);
  const data = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);

  const srcPdf = await pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;

  const total = srcPdf.numPages;
  const outline = await extractOutline(srcPdf);

  const { r: br, g: bg, b: bb } = theme;
  const outDoc = await PDFDocument.create();

  for (let i = 0; i < total; i++) {
    const page   = await srcPdf.getPage(i + 1);
    const vp     = page.getViewport({ scale });
    const canvas = createCanvas(vp.width, vp.height);
    const ctx    = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = id.data;
    for (let j = 0; j < px.length; j += 4) {
      const factor = 1 - (0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]) / 255;
      px[j]     = br + (255 - br) * factor;
      px[j + 1] = bg + (255 - bg) * factor;
      px[j + 2] = bb + (255 - bb) * factor;
    }
    ctx.putImageData(id, 0, 0);

    const img = await outDoc.embedPng(canvas.toBuffer('image/png'));
    outDoc.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });

    page.cleanup();
    onProgress?.({ page: i + 1, total });
  }

  srcPdf.destroy();

  if (outline?.length) applyOutline(outDoc, outline);

  const outPath = output ?? (() => {
    const base   = basename(inputPath, extname(inputPath));
    const suffix = theme.name.toLowerCase().replace(/\s+/g, '_');
    return resolve(dirname(resolve(inputPath)), `${base}_${suffix}_dark.pdf`);
  })();

  await writeFile(outPath, await outDoc.save());
  return outPath;
}
