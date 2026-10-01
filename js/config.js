// Conexión con el servidor de avisos (Cloudflare Worker, carpeta server/).
export const PUSH = {
  // Dirección del servidor. La da Cloudflare al publicarlo (npx wrangler deploy).
  server: 'https://rumbo-avisos.rumbo.workers.dev',
  // Clave pública VAPID: identifica a tu servidor ante Apple (no es secreta).
  publicKey: 'BJwtVmk1SVAZdAgGIcmkt8z6Ppzl3e8oPQg68EdGrvw1FSFRoX5zYEAo1I24G1i2qZ-tkEt3aIUiUcRVGBRUfqo',
};
