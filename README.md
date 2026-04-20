<img align="right" width="150" src="assets/logo.png" title="Logo from icon-icons.com" />

# dark-pdf

[![Test](https://github.com/rngil/dark-pdf/actions/workflows/test.yml/badge.svg)](https://github.com/rngil/dark-pdf/actions/workflows/test.yml)

Convert PDFs to dark mode, with table of contents preservation.

---

## Install

```sh
npm install -g dark-pdf
```

## Usage

```sh
darkpdf [options] <input.pdf>
```

### Options

| Flag                   | Default                    | Description               |
| ---------------------- | -------------------------- | ------------------------- |
| `-o, --output <path>`  | `<input>_<theme>_dark.pdf` | Output file path          |
| `-t, --theme <name>`   | `claude`                   | Theme to apply            |
| `-s, --scale <number>` | `3`                        | Render quality multiplier |
| `-h, --help`           | N/A                        | Show help                 |

### Themes

| Name       | Color         |
| ---------- | ------------- |
| `classic`  | Pure black    |
| `claude`   | Claude Warm   |
| `chatgpt`  | ChatGPT Cool  |
| `sepia`    | Sepia Dark    |
| `midnight` | Midnight Blue |
| `forest`   | Forest Green  |

## Programmatic API

```js
import { convert, THEMES } from "dark-pdf";

const outPath = await convert("/path/to/input.pdf", {
  theme: "claude",
  output: "/path/to/output.pdf",
  scale: 3,
  onProgress: ({ page, total }) => console.log(`${page}/${total}`),
});
```

---

Logo from [icon-icons.com](https://icon-icons.com/fr/icone/fichier-pdf/245974).
