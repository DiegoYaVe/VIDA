import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

const FAQS = [
  {
    q: '¿Cómo hago un pedido?',
    a: 'Explora las tiendas, agrega productos a tu carrito y confirma tu pedido indicando tu dirección de entrega.',
  },
  {
    q: '¿Cuánto tiempo tarda la entrega?',
    a: 'El tiempo varía según la tienda y tu ubicación. Generalmente entre 20 y 45 minutos. Puedes seguir el estado de tu pedido en tiempo real.',
  },
  {
    q: '¿Cómo pago mi pedido?',
    a: 'Actualmente aceptamos pago en efectivo al momento de la entrega. Próximamente añadiremos más métodos de pago.',
  },
  {
    q: '¿Puedo cancelar un pedido?',
    a: 'Puedes cancelar mientras el pedido está en estado "Buscando repartidor". Una vez asignado un repartidor, comunícate con soporte.',
  },
  {
    q: '¿Qué hago si hay un problema con mi pedido?',
    a: 'Contáctanos por WhatsApp o escríbenos a nuestro correo. Resolveremos tu problema a la brevedad.',
  },
  {
    q: '¿Cómo califico a mi repartidor?',
    a: 'Una vez entregado tu pedido, aparecerá un widget de estrellas en la pantalla de seguimiento para que califiques la experiencia.',
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.faqItem}>
      <TouchableOpacity style={styles.faqQ} onPress={() => setOpen(v => !v)} activeOpacity={0.7}>
        <Text style={styles.faqQText}>{q}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#A0AEC0" />
      </TouchableOpacity>
      {open && <Text style={styles.faqA}>{a}</Text>}
    </View>
  );
}

export default function AyudaScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ayuda</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Preguntas frecuentes</Text>
        <View style={styles.card}>
          {FAQS.map((faq, i) => <FaqItem key={i} {...faq} />)}
        </View>

        <Text style={styles.sectionTitle}>Contáctanos</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => Linking.openURL('https://wa.me/584140000000')}
          >
            <View style={[styles.contactIcon, { backgroundColor: '#F0FFF4' }]}>
              <Ionicons name="logo-whatsapp" size={22} color="#27AE60" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>WhatsApp</Text>
              <Text style={styles.contactSub}>Respuesta en menos de 1 hora</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E0" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => Linking.openURL('mailto:soporte@vidadelivery.com')}
          >
            <View style={[styles.contactIcon, { backgroundColor: '#EBF8FF' }]}>
              <Ionicons name="mail-outline" size={22} color="#1A6A9A" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>Correo electrónico</Text>
              <Text style={styles.contactSub}>soporte@vidadelivery.com</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E0" />
          </TouchableOpacity>
        </View>
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
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#A0AEC0', textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  faqItem: { borderBottomWidth: 1, borderBottomColor: '#F5F7FA' },
  faqQ: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  faqQText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1A202C', marginRight: 8 },
  faqA: { fontSize: 13, color: '#718096', lineHeight: 20, paddingHorizontal: 16, paddingBottom: 14 },
  contactItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  contactIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactInfo: { flex: 1 },
  contactTitle: { fontSize: 15, fontWeight: '600', color: '#1A202C' },
  contactSub: { fontSize: 12, color: '#718096', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F5F7FA', marginLeft: 74 },
});
