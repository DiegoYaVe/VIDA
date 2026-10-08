// Versión web (previsualizar en el navegador): el mismo mapa Leaflet con el
// estilo VIDA, dentro de un iframe.
import { createElement, useMemo } from 'react';
import { View } from 'react-native';
import { htmlLeaflet, CENTRO_DEFECTO } from './estiloMapa';
import { puntosSeguimiento, depurarSeguimiento, SCRIPT_SEGUIMIENTO } from './seguimientoMapa';
import { useTrazado } from '../services/trazado';

export default function MapaTracking({ estado }) {
  const p = puntosSeguimiento(estado);
  const vis = depurarSeguimiento(p);
  const ruta = useTrazado(vis.seq, vis.movil);
  const html = useMemo(() => htmlLeaflet(p.repartidor ?? p.destino ?? p.tienda ?? CENTRO_DEFECTO,
    `${SCRIPT_SEGUIMIENTO}\nwindow.update(${JSON.stringify({ ...p, trazo: ruta?.coords || null })});`), [JSON.stringify(p), ruta]);
  return (
    <View style={{ flex: 1, backgroundColor: '#DDEFF5' }}>
      {createElement('iframe', { srcDoc: html, style: { border: 0, width: '100%', height: '100%' }, title: 'Mapa' })}
    </View>
  );
}
