// Identidad visual de Comercializadora VIDA (colores tomados del logo).
// Marino = base y acciones principales · Celeste (la gota) = agua e
// hidratación · Verde (la hoja) = puntos, premios y ganancias.
// Texto sobre celeste o verde siempre en marino: en blanco no se lee.
export const colores = {
  marino: '#001034',
  marinoHover: '#000A22',
  marinoClaro: '#0C2A5E',
  marinoSuave: '#1B3366',
  celeste: '#62C6DE',
  celesteClaro: '#DDF2F8',
  verde: '#4DAD66',
  verdeTexto: '#1F7A3F',
  verdeClaro: '#E3F3E7',
  fondo: '#F2F9FB',
  tarjeta: '#FFFFFF',
  borde: '#DCEEF3',
  bordeFuerte: '#CFE4EB',
  texto: '#001034',
  textoSuave: '#4B5B73',
  textoTenue: '#8C9BB0',
  sobreMarino: '#A6DCEA',
  error: '#C53030',
  errorClaro: '#FDECEC',
  aviso: '#B7791F',
  avisoClaro: '#FEF3C7',
  blanco: '#FFFFFF',
};

// Familias cargadas en app/_layout.jsx con useFonts (ver components/Texto.jsx)
export const fuentes = {
  titulo: 'Poppins_700Bold',
  tituloFuerte: 'Poppins_800ExtraBold',
  tituloMedio: 'Poppins_600SemiBold',
  texto: 'NunitoSans_400Regular',
  textoSemi: 'NunitoSans_600SemiBold',
  textoBold: 'NunitoSans_700Bold',
  textoFuerte: 'NunitoSans_800ExtraBold',
};

export const radios = { chico: 12, medio: 16, grande: 22, enorme: 28 };

export const sombra = {
  shadowColor: '#001034',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export const logos = {
  completoOscuro: require('../assets/marca/vida-logo-oscuro.png'),
  completoClaro: require('../assets/marca/vida-logo-claro.png'),
  simboloOscuro: require('../assets/marca/vida-simbolo-oscuro.png'),
  simboloClaro: require('../assets/marca/vida-simbolo-claro.png'),
};
