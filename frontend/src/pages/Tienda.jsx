// src/pages/Tienda.jsx
// Página PÚBLICA de una tienda — es el destino del QR de los flyers que el
// empresario genera en Precios > Flyer. Se abre sin sesión: quien escanea el
// QR es un consumidor, no un usuario del panel.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MapPin, Phone, Navigation, Loader2, Store, PackageX } from 'lucide-react';
import api, { API_ORIGIN } from '../services/api.js';

// El QR corto ("/t/8") no lleva tenant. Todo lo desplegado hoy vive en
// idBranch=1 / idCuenta=1, así que ese es el fallback para los flyers que ya
// estén impresos; los nuevos incluyen ?b= y ?c= explícitos.
const BRANCH_POR_DEFECTO = '1';
const CUENTA_POR_DEFECTO = '1';

const precio = (n) => `$${Number(n || 0).toFixed(2)}`;

const imagen = (ruta) =>
  !ruta ? null : (String(ruta).startsWith('http') ? ruta : `${API_ORIGIN}${ruta}`);

export default function Tienda() {
  const { idPuntoVenta } = useParams();
  const [params] = useSearchParams();
  const idBranch = params.get('b') || BRANCH_POR_DEFECTO;
  const idCuenta = params.get('c') || CUENTA_POR_DEFECTO;

  const [tienda, setTienda]       = useState(null);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const q = { idBranch, idCuenta };
        const [tRes, pRes] = await Promise.all([
          api.get(`/delivery/tienda/${idPuntoVenta}`, { params: q }),
          api.get('/delivery/productos', { params: { ...q, idPuntoVenta } }),
        ]);
        if (cancelado) return;
        setTienda(tRes.data);
        setProductos(Array.isArray(pRes.data) ? pRes.data : []);
      } catch (err) {
        if (cancelado) return;
        setError(err.response?.status === 404
          ? 'No encontramos esta tienda. Puede que el enlace sea viejo o que la tienda ya no esté activa.'
          : 'No pudimos cargar la tienda. Intenta de nuevo en un momento.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [idPuntoVenta, idBranch, idCuenta]);

  if (cargando) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="h-7 w-7 text-vida-green animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-sm">
        <Store className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-600 font-semibold">{error}</p>
      </div>
    </div>
  );

  const mapa = (tienda?.Latitud && tienda?.Longitud)
    ? `https://www.google.com/maps/search/?api=1&query=${tienda.Latitud},${tienda.Longitud}`
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-vida-navy text-white px-6 pt-10 pb-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-vida-teal text-xs font-black tracking-widest uppercase">Comercializadora VIDA</p>
          <h1 className="text-2xl sm:text-3xl font-black mt-1">{tienda?.NomComercial}</h1>

          {tienda?.Direccion?.trim() && (
            <p className="flex items-start gap-2 text-white/80 text-sm mt-3">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{tienda.Direccion.trim()}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-2 mt-5">
            {mapa && (
              <a href={mapa} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-2 bg-vida-green hover:bg-vida-green-dark transition
                            text-white text-sm font-bold rounded-lg px-4 py-2">
                <Navigation className="h-4 w-4" /> Cómo llegar
              </a>
            )}
            {tienda?.Telefono && (
              <a href={`tel:${tienda.Telefono}`}
                 className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 transition
                            text-white text-sm font-bold rounded-lg px-4 py-2">
                <Phone className="h-4 w-4" /> {tienda.Telefono}
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-lg font-black text-vida-blue mb-4">
          Productos disponibles
          {productos.length > 0 && (
            <span className="text-gray-400 font-bold text-sm ml-2">({productos.length})</span>
          )}
        </h2>

        {productos.length === 0 ? (
          <div className="text-center py-14">
            <PackageX className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-semibold">Esta tienda no tiene productos con stock ahora mismo.</p>
            <p className="text-gray-400 text-sm mt-1">Vuelve a intentarlo más tarde.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {productos.map(p => {
              const img = imagen(p.ImagenProducto);
              const enOferta = p.PrecioPromo != null && Number(p.PrecioPromo) < Number(p.PrecioUSD);
              return (
                <article key={`${p.idProducto}-${p.idPuntoVenta}`}
                         className="bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col">
                  <div className="aspect-square bg-gray-50 flex items-center justify-center">
                    {img
                      ? <img src={img} alt={p.Nombre} className="w-full h-full object-cover" loading="lazy" />
                      : <Store className="h-8 w-8 text-gray-200" />}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <div className="flex items-start gap-1">
                      <h3 className="text-sm font-bold text-gray-800 leading-tight flex-1">{p.Nombre}</h3>
                      {p.EsProductoPlus && (
                        <span className="shrink-0 text-[9px] font-black text-amber-700 bg-amber-100
                                         rounded px-1.5 py-0.5">PLUS</span>
                      )}
                    </div>
                    <div className="mt-auto pt-2">
                      {enOferta ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-vida-green font-black">{precio(p.PrecioPromo)}</span>
                          <span className="text-gray-400 text-xs line-through">{precio(p.PrecioUSD)}</span>
                        </div>
                      ) : (
                        <span className="text-vida-blue font-black">{precio(p.PrecioUSD)}</span>
                      )}
                      {p.PromoBadge && (
                        <span className="ml-2 text-[10px] font-black text-white bg-vida-teal rounded px-1.5 py-0.5">
                          {p.PromoBadge}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-6 pb-12">
        <div className="bg-vida-green-light border border-vida-green/20 rounded-xl p-5 text-center">
          <p className="font-black text-vida-blue">Pide desde la app VIDA</p>
          <p className="text-sm text-gray-600 mt-1">
            Haz tu pedido, sigue al repartidor en vivo y acumula puntos en cada compra.
          </p>
        </div>
      </footer>
    </div>
  );
}
