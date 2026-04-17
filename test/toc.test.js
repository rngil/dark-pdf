import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractOutline, applyOutline } from '../src/index.js';

const _require = createRequire(import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(dirname(_require.resolve('pdfjs-dist/package.json')), 'legacy', 'build', 'pdf.worker.mjs')
).href;

const samplePath = fileURLToPath(new URL('../assets/pdf-sample.pdf', import.meta.url));

async function loadSample() {
  const buf = await readFile(samplePath);
  return pdfjsLib.getDocument({
    data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
}

describe('TOC tools', () => {
  it('extractOutline returns items with title, pageIndex, and items', async () => {
    const doc = await loadSample();
    const outline = await extractOutline(doc);
    doc.destroy();

    expect(Array.isArray(outline)).toBe(true);
    expect(outline.length).toBeGreaterThan(0);
    for (const item of outline) {
      expect(typeof item.title).toBe('string');
      expect(typeof item.pageIndex).toBe('number');
      expect(Array.isArray(item.items)).toBe(true);
    }
  });

  it('applyOutline writes Outlines to the PDF catalog', async () => {
    const buf = await readFile(samplePath);
    const doc = await PDFDocument.load(buf);
    const srcDoc = await loadSample();
    const outline = await extractOutline(srcDoc);
    srcDoc.destroy();

    applyOutline(doc, outline);

    expect(doc.catalog.has(PDFName.of('Outlines'))).toBe(true);
  });
});
