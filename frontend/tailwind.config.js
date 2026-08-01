export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vida: {
          // Paleta ejecutiva VIDA — navy + verde agua (aqua→verde)
          green:       '#5BBE6A',   // verde agua (extremo verde) — CTA/positivo
          'green-dark':'#46A657',
          'green-light':'#EAF7EE',
          blue:        '#0A1E3F',   // navy — color primario
          'blue-dark': '#061630',   // navy hover
          'blue-light':'#E9EEF5',   // tinte navy claro
          teal:        '#54C4E0',   // aqua (verde agua, extremo aqua)
          aqua:        '#54C4E0',
          navy:        '#0A1E3F',
          gray:        '#F4F6F8',
          'gray-dark': '#7F8C8D',
          dark:        '#0A1E3F',
        }
      },
      backgroundImage: {
        // Gradiente verde agua oficial (aqua → verde) para logos, avatares y acentos
        'vida-agua': 'linear-gradient(135deg, #54C4E0, #5BBE6A)',
        'vida-navy': 'linear-gradient(135deg, #0A1E3F, #16345E)',
      },
      fontFamily: {
        sans: ['"Nunito"', 'sans-serif'],
        display: ['"Nunito"', 'sans-serif'],
      },
    }
  },
  plugins: [],
}
