export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vida: {
          green:      '#27AE60',
          'green-dark':'#1E8449',
          'green-light':'#EAFAF1',
          blue:       '#2980B9',
          'blue-dark':'#1A6A9A',
          'blue-light':'#EBF5FB',
          teal:       '#1ABC9C',
          gray:       '#F4F6F8',
          'gray-dark':'#7F8C8D',
          dark:       '#2C3E50',
        }
      },
      fontFamily: {
        sans: ['"Nunito"', 'sans-serif'],
        display: ['"Nunito"', 'sans-serif'],
      },
    }
  },
  plugins: [],
}
