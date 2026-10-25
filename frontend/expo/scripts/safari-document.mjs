export function safariDocument(html) {
  if (html.includes('id="almost-human-safari-shell"')) return html;
  const viewport = /<meta\s+name="viewport"[^>]*>/i;
  if (!viewport.test(html) || !html.includes('</head>')) throw new Error('The Expo web document is missing its viewport or head.');
  return html.replace(viewport, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />')
    .replace('</head>', `<meta name="theme-color" content="#0b0a08" />
    <style id="almost-human-safari-shell">
      html { height: auto !important; overflow-y: auto !important; overflow-x: hidden; background: #0b0a08; -webkit-text-size-adjust: 100%; }
      body { height: auto !important; overflow: visible !important; margin: 0; background: #0b0a08; }
      #root { min-height: 0; height: 100vh; height: 100svh; }
    </style>
  </head>`);
}
