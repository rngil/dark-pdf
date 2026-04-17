#!/usr/bin/env node 
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { convert, THEMES } from './src/index.js';

const themeList = Object.keys(THEMES).join(', ');

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: 'string',  short: 'o' },
    theme:  { type: 'string',  short: 't', default: 'claude' },
    scale:  { type: 'string',  short: 's', default: '3' },
    help:   { type: 'boolean', short: 'h', default: false },
  },
});

if (opts.help || positionals.length === 0) {
  console.log(`
Usage: darkpdf [options] <input.pdf>

Options:
  -o, --output <path>   Output file path (default: <input>_<theme>_dark.pdf)
  -t, --theme <name>    Dark theme (default: claude)
                        Available: ${themeList}
  -s, --scale <number>  Render quality multiplier (default: 3)
  -h, --help            Show this help message
`.trim());
  process.exit(0);
}

if (!THEMES[opts.theme]) {
  console.error(`Unknown theme "${opts.theme}". Available: ${themeList}`);
  process.exit(1);
}

const scale = parseFloat(opts.scale);
const log   = msg => process.stderr.write(msg + '\n');

let failed = false;
for (const file of positionals) {
  const inputPath = resolve(file);
  log(`Reading: ${inputPath}`);

  let lastPct = -1;
  function onProgress({ page, total }) {
    const pct = Math.round(page / total * 100);
    if (pct !== lastPct) {
      process.stderr.write(`\r  Converting page ${page}/${total} (${pct}%)  `);
      lastPct = pct;
    }
  }

  try {
    const outPath = await convert(inputPath, {
      theme: opts.theme,
      output: positionals.length === 1 ? opts.output : undefined,
      scale,
      onProgress,
    });
    process.stderr.write('\n');
    log(`Done → ${outPath}`);
  } catch (err) {
    process.stderr.write('\n');
    console.error('Error:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    failed = true;
  }
}

if (failed) process.exit(1);
