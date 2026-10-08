// Agregar al carrito respetando que un pedido es de UNA tienda: si el carrito
// tiene productos de otra, se pregunta antes de vaciarlo.
import { Alert } from 'react-native';
import useCarritoStore from '../store/carritoStore';

export function agregarConTienda(p, cantidad = 1, despues) {
  const st = useCarritoStore.getState();
  const hacer = () => {
    const s = useCarritoStore.getState();
    if (!s.idPuntoVenta || s.items.length === 0) s.setSucursal(p.idPuntoVenta, p.NombreSucursal || '');
    s.agregarItem({
      idProducto: p.idProducto,
      Nombre: p.Nombre,
      PrecioUSD: parseFloat(p.PrecioUSD || 0),
      ImagenProducto: p.ImagenProducto || '',
    }, cantidad);
    despues?.();
  };
  if (st.idPuntoVenta && String(st.idPuntoVenta) !== String(p.idPuntoVenta) && st.items.length > 0) {
    Alert.alert(
      'Carrito de otra tienda',
      `Tienes productos de "${st.nombreSucursal}". ¿Vaciar el carrito y pedir de "${p.NombreSucursal || 'esta tienda'}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Vaciar y agregar', style: 'destructive', onPress: () => { useCarritoStore.getState().limpiarCarrito(); hacer(); } },
      ],
    );
    return false;
  }
  hacer();
  return true;
}
