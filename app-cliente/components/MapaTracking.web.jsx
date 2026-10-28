// Versión web (previsualizar en el navegador): el mismo mapa Leaflet con el
// estilo VIDA, dentro de un iframe.
import { createElement, useMemo } from 'react';
import { View } from 'react-native';
import { htmlLeaflet, CENTRO_DEFECTO } from './estiloMapa';
import { puntosSeguimiento, depurarSeguimiento, etiquetasSeguimiento, SCRIPT_SEGUIMIENTO } from './seguimientoMapa';
import { useTrazado } from '../services/trazado';

export default function MapaTracking({ estado }) {
  const p = puntosSeguimiento(estado);
  const vis = depurarSeguimiento(p);
  const ruta = useTrazado(vis.seq, vis.movil);
  const datos = JSON.stringify({ ...vis, trazo: ruta?.coords || null, etiquetas: etiquetasSeguimiento(p, vis, ruta) });
  const html = useMemo(() => htmlLeaflet(vis.encuadre[0] ?? CENTRO_DEFECTO,
    `${SCRIPT_SEGUIMIENTO}\nwindow.update(${datos});`), [datos]);
  return (
    <View style={{ flex: 1, backgroundColor: '#E6F3F7' }}>
      {createElement('iframe', { srcDoc: html, style: { border: 0, width: '100%', height: '100%' }, title: 'Mapa' })}
    </View>
  );
}
