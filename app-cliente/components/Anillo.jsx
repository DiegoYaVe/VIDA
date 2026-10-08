// Anillo de progreso (meta de hidratación): pista y avance desde las 12.
import Svg, { Circle } from 'react-native-svg';
import { View } from 'react-native';

export default function Anillo({ tam = 104, grosor = 12, avance = 0, color = '#62C6DE', pista = '#1B3366', children }) {
  const r = (tam - grosor) / 2;
  const largo = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, Number(avance) || 0));
  return (
    <View style={{ width: tam, height: tam, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={tam} height={tam} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={tam / 2} cy={tam / 2} r={r} stroke={pista} strokeWidth={grosor} fill="none" />
        {p > 0 && (
          <Circle cx={tam / 2} cy={tam / 2} r={r} stroke={color} strokeWidth={grosor} fill="none"
            strokeDasharray={`${largo * p} ${largo}`} />
        )}
      </Svg>
      {children}
    </View>
  );
}
