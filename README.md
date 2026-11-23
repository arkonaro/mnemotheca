# Mnemotheca

Atlante di cose belle — sito di [@mnemotheca](https://www.instagram.com/mnemotheca/), pubblicato su mnemotheca.org.

- `index.html`, `style.css`, `main.js`, `sound.js`: il sito (statico, nessuna dipendenza).
- `data/opere.json`: le opere, generato da `tools/build_data.py` partendo da `src/` (export Instagram + Notion + descrizioni).
- `img/t` (miniature) e `img/l` (grandi): webp generati da `tools/optimize.py`.
