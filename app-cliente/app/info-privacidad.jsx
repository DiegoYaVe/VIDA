import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

const SECTIONS = [
  {
    title: '1. Información que recopilamos',
    body: 'Recopilamos información que nos proporcionas al registrarte: nombre, número de teléfono, correo electrónico y ubicación de entrega. También recopilamos datos de uso de la aplicación para mejorar nuestros servicios.',
  },
  {
    title: '2. Uso de tu información',
    body: 'Utilizamos tu información para procesar pedidos, asignar repartidores, enviarte notificaciones sobre el estado de tu pedido y mejorar tu experiencia en la aplicación. No vendemos tu información a terceros.',
  },
  {
    title: '3. Compartir información',
    body: 'Compartimos tu nombre y dirección de entrega con el repartidor asignado a tu pedido. Los negocios reciben información básica necesaria para preparar tu pedido.',
  },
  {
    title: '4. Ubicación',
    body: 'Utilizamos tu ubicación para mostrar tiendas cercanas y facilitar la entrega de pedidos. Puedes desactivar el acceso a la ubicación desde los ajustes de tu dispositivo, aunque esto puede afectar algunas funciones.',
  },
  {
    title: '5. Seguridad',
    body: 'Implementamos medidas de seguridad técnicas y organizativas para proteger tu información personal contra acceso no autorizado, pérdida o divulgación.',
  },
  {
    title: '6. Retención de datos',
    body: 'Conservamos tu información mientras tu cuenta esté activa. Puedes solicitar la eliminación de tu cuenta desde la sección de Perfil de la aplicación.',
  },
  {
    title: '7. Tus derechos',
    body: 'Tienes derecho a acceder, rectificar y eliminar tus datos personales. Para ejercer estos derechos, contáctanos a través de los canales de soporte disponibles en la sección de Ayuda.',
  },
  {
    title: '8. Cambios a este aviso',
    body: 'Podemos actualizar este aviso de privacidad ocasionalmente. Te notificaremos sobre cambios significativos a través de la aplicación.',
  },
  {
    title: '9. Contacto',
    body: 'Si tienes preguntas sobre este aviso de privacidad, contáctanos en: soporte@vidadelivery.com',
  },
];

export default function PrivacidadScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Aviso de privacidad</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          En VIDA Delivery nos comprometemos a proteger tu privacidad. Este aviso describe cómo
          recopilamos, usamos y protegemos tu información personal.
        </Text>
        <Text style={styles.updated}>Última actualización: julio 2026</Text>

        {SECTIONS.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#EDF2F7',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A202C' },
  scroll: { padding: 20, paddingBottom: 40 },
  intro: { fontSize: 14, color: '#4A5568', lineHeight: 22, marginBottom: 8 },
  updated: { fontSize: 12, color: '#A0AEC0', marginBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#1A202C', marginBottom: 6 },
  sectionBody: { fontSize: 13, color: '#718096', lineHeight: 21 },
});
