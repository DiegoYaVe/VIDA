// Text y TextInput con la tipografía de la marca. Elige la fuente según el
// peso y el tamaño del estilo, así cada pantalla conserva sus estilos:
//   títulos (18 px o más, negrita) → Poppins · resto → Nunito Sans.
// Un estilo con fontFamily propio se respeta tal cual.
import { forwardRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native';
import { fuentes } from '../constants/tema';

const NEGRITAS = ['700', '800', '900', 'bold'];

export function familiaPara(estilo) {
  const peso = String(estilo?.fontWeight ?? '400');
  const tam = Number(estilo?.fontSize ?? 14);
  if (tam >= 18 && NEGRITAS.includes(peso)) return ['800', '900'].includes(peso) ? fuentes.tituloFuerte : fuentes.titulo;
  if (['800', '900'].includes(peso)) return fuentes.textoFuerte;
  if (['700', 'bold'].includes(peso)) return fuentes.textoBold;
  if (['500', '600'].includes(peso)) return fuentes.textoSemi;
  return fuentes.texto;
}

function conFuente(style) {
  const plano = StyleSheet.flatten(style) || {};
  if (plano.fontFamily) return style;
  // fontWeight 'normal': la fuente ya trae el peso; si no, Android la engrosa
  return [style, { fontFamily: familiaPara(plano), fontWeight: 'normal' }];
}

export const Text = forwardRef(function Texto({ style, ...props }, ref) {
  return <RNText ref={ref} {...props} style={conFuente(style)} />;
});

export const TextInput = forwardRef(function Entrada({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={conFuente(style)} />;
});
