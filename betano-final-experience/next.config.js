/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // El evento 2026 corre solo la trivia: el ranking y los pronósticos quedan
  // fuera de circulación. Temporal (307) — las vistas siguen en el repo para
  // restaurarlas sin recuperar URLs ya cacheadas por el navegador.
  async redirects() {
    return [
      { source: "/juego/ranking", destination: "/juego", permanent: false },
      { source: "/juego/pronosticos", destination: "/juego", permanent: false },
    ];
  },
};

module.exports = nextConfig;
