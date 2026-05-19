const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const tags = `
    <meta name="description" content="1v1 live Quant, DILR &amp; VARC duels. Elo-rated matchmaking, live scoring, free to play." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://exam-duel.com/" />
    <meta property="og:site_name" content="CAT Duel" />
    <meta property="og:title" content="CAT Duel" />
    <meta property="og:description" content="1v1 live Quant, DILR &amp; VARC duels. Elo-rated matchmaking, live scoring, free to play." />
    <meta property="og:image" content="https://exam-duel.com/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="CAT Duel" />
    <meta name="twitter:description" content="1v1 live Quant, DILR &amp; VARC duels. Elo-rated matchmaking, live scoring, free to play." />
    <meta name="twitter:image" content="https://exam-duel.com/og-image.png" />`;

html = html.replace('</head>', tags + '\n  </head>');
fs.writeFileSync(indexPath, html);
console.log('OG tags injected into dist/index.html');
