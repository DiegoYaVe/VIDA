// Pantalla del repartidor de proveedores (tarea 24, fase 2): recolecciones
// disponibles que su vehículo aguanta, y las que ya aceptó (recoger en la
// sucursal con el código de retiro, luego avisar la entrega en la tienda).
import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Linking, Platform } from 'react-native';
import { Text, TextInput } from '../../components/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { colores, fuentes, radios } from '../../constants/tema';

const abrirMapa = (lat, lng, etiqueta) => {
  if (lat == null || lng == null) return;
  const q = encodeURIComponent(etiqueta || 'Destino');
  const url = Platform.select({
    ios: `maps:0,0?q=${q}@${lat},${lng}`,
    android: `geo:0,0?q=${lat},${lng}(${q})`,
  });
  Linking.openURL(url).catch(() => {});
};

const RETIRABLE = ['CONFIRMADO', 'LISTO'];

export default function RecoleccionesScreen() {
  const [disponibles, setDisponibles] = useState([]);
  const [activas, setActivas] = useState([]);
  const [codigos, setCodigos] = useState({});   // idPedidoProveedor → código tecleado
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(null);  // idPedidoProveedor en acción

  const cargar = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        api.get('/delivery/repartidor/envios-disponibles'),
        api.get('/delivery/repartidor/envios-activos'),
      ]);
      setDisponibles(d.data || []);
      setActivas(a.data || []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudieron cargar las recolecciones');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (id, fn) => {
    setOcupado(id);
    setError('');
    try {
      await fn();
      await cargar();
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo completar la acción');
    } finally {
      setOcupado(null);
    }
  };

  const aceptar  = (id) => accion(id, () => api.post('/delivery/repartidor/envios/aceptar',  { idPedidoProveedor: id }));
  const entregar = (id) => accion(id, () => api.post('/delivery/repartidor/envios/entregar', { idPedidoProveedor: id }));
  const recoger  = (id) => {
    const codigo = (codigos[id] || '').trim();
    if (!codigo) { setError('Escribe el código de retiro que te da la sucursal'); return; }
    accion(id, () => api.post('/delivery/repartidor/envios/recoger', { idPedidoProveedor: id, Codigo: codigo }));
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} colors={[colores.marino]} />}
      >
        <Text style={styles.titulo}>Recolecciones</Text>
        <Text style={styles.subtitulo}>Recoges en el proveedor y llevas a la tienda.</Text>

        {error ? (
          <TouchableOpacity style={styles.error} onPress={() => { setCargando(true); cargar(); }}>
            <Text style={styles.errorTexto}>{error}</Text>
          </TouchableOpacity>
        ) : null}

        {cargando ? <ActivityIndicator color={colores.marino} style={{ marginVertical: 40 }} /> : (
          <>
            {/* ── Activas ── */}
            <Text style={styles.seccion}>En curso ({activas.length})</Text>
            {activas.length === 0 ? (
              <Text style={styles.vacio}>No tienes recolecciones en curso.</Text>
            ) : activas.map((e) => {
              const porRecoger = RETIRABLE.includes(e.Status);
              const trabajando = ocupado === e.idPedidoProveedor;
              return (
                <View key={e.idPedidoProveedor} style={styles.tarjeta}>
                  <View style={styles.filaTop}>
                    <Text style={styles.folio}>{e.Folio}</Text>
                    <View style={[styles.badge, porRecoger ? styles.badgeAzul : styles.badgeNaranja]}>
                      <Text style={styles.badgeTexto}>{porRecoger ? 'Por recoger' : 'En camino'}</Text>
                    </View>
                  </View>
                  {e.PesoKg != null && <Text style={styles.peso}>{e.PesoKg} kg</Text>}

                  {porRecoger ? (
                    <>
                      <Parada icono="storefront-outline" titulo="Recoge en" nombre={e.Sucursal?.Nombre} dir={e.Sucursal?.Direccion}
                        onMapa={() => abrirMapa(e.Sucursal?.Latitud, e.Sucursal?.Longitud, e.Sucursal?.Nombre)} />
                      <Text style={styles.label}>Código de retiro</Text>
                      <TextInput
                        style={styles.input} placeholder="Ej. K7P2M9QX" placeholderTextColor="#8C9BB0"
                        autoCapitalize="characters" value={codigos[e.idPedidoProveedor] || ''}
                        onChangeText={(t) => setCodigos(c => ({ ...c, [e.idPedidoProveedor]: t.toUpperCase() }))} />
                      <TouchableOpacity style={[styles.boton, trabajando && { opacity: 0.6 }]} disabled={trabajando}
                        onPress={() => recoger(e.idPedidoProveedor)}>
                        {trabajando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.botonTexto}>Ya la recogí</Text>}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Parada icono="home-outline" titulo="Lleva a" nombre={e.Tienda?.Nombre} dir={e.Tienda?.Direccion}
                        onMapa={() => abrirMapa(e.Tienda?.Latitud, e.Tienda?.Longitud, e.Tienda?.Nombre)} />
                      <TouchableOpacity style={[styles.boton, trabajando && { opacity: 0.6 }]} disabled={trabajando}
                        onPress={() => entregar(e.idPedidoProveedor)}>
                        {trabajando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.botonTexto}>Llegué a la tienda</Text>}
                      </TouchableOpacity>
                      <Text style={styles.nota}>La tienda confirma la recepción al recibir el pedido.</Text>
                    </>
                  )}
                </View>
              );
            })}

            {/* ── Disponibles ── */}
            <Text style={[styles.seccion, { marginTop: 10 }]}>Disponibles ({disponibles.length})</Text>
            {disponibles.length === 0 ? (
              <Text style={styles.vacio}>No hay recolecciones para tu vehículo ahora mismo.</Text>
            ) : disponibles.map((e) => {
              const trabajando = ocupado === e.idPedidoProveedor;
              return (
                <View key={e.idPedidoProveedor} style={styles.tarjeta}>
                  <View style={styles.filaTop}>
                    <Text style={styles.folio}>{e.Folio}</Text>
                    {e.PesoKg != null && <Text style={styles.peso}>{e.PesoKg} kg</Text>}
                  </View>
                  <Parada icono="storefront-outline" titulo="Recoge en" nombre={e.Sucursal?.Nombre} dir={e.Sucursal?.Direccion}
                    onMapa={() => abrirMapa(e.Sucursal?.Latitud, e.Sucursal?.Longitud, e.Sucursal?.Nombre)} />
                  <Parada icono="home-outline" titulo="Lleva a" nombre={e.Tienda?.Nombre} dir={e.Tienda?.Direccion}
                    onMapa={() => abrirMapa(e.Tienda?.Latitud, e.Tienda?.Longitud, e.Tienda?.Nombre)} />
                  <TouchableOpacity style={[styles.boton, trabajando && { opacity: 0.6 }]} disabled={trabajando}
                    onPress={() => aceptar(e.idPedidoProveedor)}>
                    {trabajando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.botonTexto}>Aceptar recolección</Text>}
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Parada({ icono, titulo, nombre, dir, onMapa }) {
  return (
    <View style={styles.parada}>
      <Ionicons name={icono} size={18} color={colores.marino} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.paradaTitulo}>{titulo}</Text>
        <Text style={styles.paradaNombre}>{nombre || '—'}</Text>
        {dir ? <Text style={styles.paradaDir}>{dir}</Text> : null}
      </View>
      {(onMapa) ? (
        <TouchableOpacity onPress={onMapa} style={styles.mapaBtn} accessibilityLabel="Abrir en el mapa">
          <Ionicons name="navigate-outline" size={18} color={colores.marino} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  scroll: { padding: 20, paddingBottom: 40, gap: 10 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 26, color: colores.marino },
  subtitulo: { fontSize: 13, color: colores.textoSuave, marginBottom: 6 },

  error: { backgroundColor: colores.errorClaro, borderRadius: radios.chico, padding: 12 },
  errorTexto: { color: colores.error, fontSize: 13, fontWeight: '700' },

  seccion: { fontWeight: '800', fontSize: 15, color: colores.marino, marginTop: 4 },
  vacio: { fontSize: 14, color: colores.textoSuave, paddingVertical: 10 },

  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, padding: 16, gap: 10 },
  filaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  folio: { fontFamily: fuentes.tituloMedio, fontSize: 16, color: colores.marino },
  peso: { fontSize: 13, fontWeight: '800', color: colores.textoSuave },

  badge: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4 },
  badgeAzul: { backgroundColor: '#E6F0FF' },
  badgeNaranja: { backgroundColor: '#FDEBD6' },
  badgeTexto: { fontSize: 12, fontWeight: '800', color: colores.marino },

  parada: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  paradaTitulo: { fontSize: 11, fontWeight: '800', color: colores.textoSuave, textTransform: 'uppercase' },
  paradaNombre: { fontSize: 15, fontWeight: '700', color: colores.marino },
  paradaDir: { fontSize: 13, color: colores.textoSuave },
  mapaBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center' },

  label: { fontSize: 12, fontWeight: '800', color: colores.marino },
  input: { height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colores.borde, backgroundColor: colores.blanco, paddingHorizontal: 14, fontSize: 16, color: colores.marino, letterSpacing: 2 },

  boton: { height: 52, borderRadius: 16, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  botonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 16 },
  nota: { fontSize: 12, color: colores.textoSuave },
});
