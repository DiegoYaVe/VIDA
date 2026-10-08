// Versión web (previsualizar la app en el navegador): el mismo mapa Leaflet
// con el estilo VIDA, dentro de un iframe.
import { createElement, useMemo } from 'react';
import { View } from 'react-native';
import { htmlLeaflet, buildPuntos, SCRIPT_RUTA, CENTRO_DEFECTO, depurarParadas } from './estiloMapa';
import { useTrazado } from '../services/trazado';

export default function MapaRuta({ ubicacion, paradas, numerar = true, margenAbajo = 40 }) {
  const { yo, stops } = useMemo(() => buildPuntos(ubicacion, paradas), [JSON.stringify(ubicacion), JSON.stringify(paradas)]);
  const ruta = useTrazado([yo, ...depurarParadas(yo, stops)], yo ? 0 : -1);
  const html = useMemo(() => {
    const datos = JSON.stringify({ yo, stops, numerar: numerar && stops.filter((s) => s.tipo === 'ENTREGA').length > 1, margenAbajo, trazo: ruta?.coords || null });
    return htmlLeaflet(yo ?? stops[0] ?? CENTRO_DEFECTO, `${SCRIPT_RUTA}\nwindow.update(${datos});`);
  }, [yo, stops, numerar, margenAbajo, ruta]);
  return (
    <View style={{ flex: 1, backgroundColor: '#DDEFF5' }}>
      {createElement('iframe', { srcDoc: html, style: { border: 0, width: '100%', height: '100%' }, title: 'Mapa' })}
    </View>
  );
}
