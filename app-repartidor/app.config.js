// Configuración dinámica sobre app.json. La llave de Google Maps para Android
// (Maps SDK for Android, restringida al paquete y a la huella SHA-1 de EAS) no
// se versiona: viene de GOOGLE_MAPS_ANDROID_KEY (variable de EAS para los
// builds; .env para el entorno local). Sin llave, la app usa el mapa con el
// estilo VIDA sobre OpenStreetMap en lugar de Google (extra.mapasGoogle).
module.exports = ({ config }) => {
  const llave = (process.env.GOOGLE_MAPS_ANDROID_KEY || '').trim();
  return {
    ...config,
    android: {
      ...config.android,
      config: { ...(config.android?.config || {}), ...(llave ? { googleMaps: { apiKey: llave } } : {}) },
    },
    extra: { ...(config.extra || {}), mapasGoogle: !!llave },
  };
};
