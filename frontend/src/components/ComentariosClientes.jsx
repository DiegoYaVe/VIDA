// Comentarios y sugerencias que dejan los clientes en la app VIDA Compras al
// calificar la entrega (Reportes → Delivery). Llegan con /reportes/delivery.
import { MessageSquareText, Star } from 'lucide-react';

const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function ComentariosClientes({ comentarios = [] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <MessageSquareText size={16} className="text-vida-blue" />
          Comentarios y sugerencias de clientes
        </h3>
        <span className="text-xs text-gray-400 shrink-0">{comentarios.length} en el período</span>
      </div>
      {comentarios.length === 0 ? (
        <p className="text-center text-gray-400 py-10 text-sm px-4">
          Aún no hay comentarios. Los clientes los dejan en la app al calificar su entrega.
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {comentarios.map((c) => (
            <li key={c.idPedido} className="px-5 py-4 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold" aria-label={`${c.Estrellas} de 5 estrellas`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={12} className={n <= c.Estrellas ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
                  ))}
                </span>
                <span className="font-semibold text-gray-700">{c.Cliente || 'Cliente'}</span>
                <span>{c.Tienda}</span>
                {c.Repartidor ? <span>Repartidor: {c.Repartidor}</span> : null}
                <span>Pedido #{c.idPedido}</span>
                <span className="ml-auto">{fecha(c.FechaAlta)}</span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-line break-words">{c.Comentario}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
