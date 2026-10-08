import { View } from 'react-native';
import { Text } from './Texto';
import { precioMonedas } from '../services/moneda';

// Precio principal con su equivalente en la otra moneda debajo (si la cuenta
// maneja bolívares). `tasa` viene de useTasaReferencial().
export default function Precio({ usd, tasa, style, styleSecundario, align = 'left' }) {
  const { principal, secundario } = precioMonedas(usd, tasa);
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
      <Text style={style}>{principal}</Text>
      {secundario ? (
        <Text style={[{ fontSize: 11, color: '#4B5B73', marginTop: 1 }, styleSecundario]}>{secundario}</Text>
      ) : null}
    </View>
  );
}
