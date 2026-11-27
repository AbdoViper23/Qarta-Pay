import type { MetadataRoute } from 'next';

/** Web app manifest: name and icons when the store is added to a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Qarta Pay',
    short_name: 'Qarta Pay',
    description: 'Spend QIE and QUSDC on airtime and gift cards, held in escrow until delivery.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ecebe6',
    theme_color: '#d9381e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
