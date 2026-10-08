import { useEffect, useState } from 'react';
import api from './api';
import { ID_BRANCH, ID_CUENTA } from '../constants/config';

// Tasa de referencia para mostrar precios en bolívares fuera del checkout.
// Es solo referencia: el cobro real se cotiza y congela al confirmar el pedido.
const VIGENCIA_MS = 10 * 60 * 1000;
let cache = null;       // { valor, en }
let pendiente = null;

export async function obtenerTasaReferencial() {
  if (cache && Date.now() - cache.en < VIGENCIA_MS) return cache.valor;
  if (!pendiente) {
    pendiente = api.get('/delivery/tasa-referencial', { params: { idBranch: ID_BRANCH, idCuenta: ID_CUENTA } })
      .then((r) => { cache = { valor: r.data, en: Date.now() }; return r.data; })
      .catch(() => cache?.valor ?? null)
      .finally(() => { pendiente = null; });
  }
  return pendiente;
}

export function useTasaReferencial() {
  const [valor, setValor] = useState(cache?.valor ?? null);
  useEffect(() => {
    let vivo = true;
    obtenerTasaReferencial().then((v) => { if (vivo) setValor(v); });
    return () => { vivo = false; };
  }, []);
  return valor;
}

export const fmtUSD = (n) => `$${Number(n || 0).toFixed(2)}`;
export const fmtVES = (n) =>
  `Bs ${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const red2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Precio en las monedas que maneja la cuenta:
// USD (o sin tasa vigente) → "$1.70"
// AMBAS → "$1.70" y "≈ Bs 1.481,33"
// VES   → "Bs 1.481,33" y "ref. $1.70"
export function precioMonedas(usd, ref) {
  const tc = Number(ref?.tasa?.VESporUSD);
  const modo = ref?.Modo || 'USD';
  if (!Number.isFinite(tc) || tc <= 0 || modo === 'USD') return { principal: fmtUSD(usd), secundario: null };
  const ves = fmtVES(red2(Number(usd || 0) * tc));
  return modo === 'VES'
    ? { principal: ves, secundario: `ref. ${fmtUSD(usd)}` }
    : { principal: fmtUSD(usd), secundario: `≈ ${ves}` };
}

// En una sola línea, para botones: "$3.40 · ≈ Bs 2.962,65".
export function precioEnLinea(usd, ref) {
  const { principal, secundario } = precioMonedas(usd, ref);
  return secundario ? `${principal} · ${secundario}` : principal;
}

// Lo que el cliente pagó o pagará en bolívares según el snapshot del pedido
// (la tasa de ese momento, no la de hoy). null si el pedido es en USD.
// IGTF cobrado en el pedido (efectivo en dólares en tiendas contribuyentes
// especiales); 0 si no aplica.
export function igtfDelPedido(pedido) {
  let p = pedido?.PagoMonedaJSON;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return 0; } }
  return Number(p?.IGTFUSD) > 0 ? Number(p.IGTFUSD) : 0;
}

export function montoVESDelPedido(pedido) {
  let p = pedido?.PagoMonedaJSON;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return null; } }
  if (p?.Moneda !== 'VES') return null;
  const monto = Number(p.TotalOriginal ?? p.TotalVES);
  return Number.isFinite(monto) ? fmtVES(monto) : null;
}
