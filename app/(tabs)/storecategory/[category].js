import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { firebaseApp } from '../../../lib/firebase';

export default function CategoryScreen() {
  const { category } = useLocalSearchParams();
  const router = useRouter();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const db = getFirestore(firebaseApp);
        const querySnapshot = await getDocs(collection(db, 'stores'));
        const storesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filtered = storesData.filter(store => store.category === category);
        setStores(filtered);
      } catch (error) {
        console.error('Error fetching category stores:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, [category]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00796b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{category} Stores</Text>
      <FlatList
        data={stores}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/store/${item.id}`)} style={styles.card}>
            <Image source={{ uri: item.image }} style={styles.image} />
            <View style={styles.cardBody}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.offer}>{item.offer}</Text>
              <Text style={styles.points}>{item.pointsNeeded} Points</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: 130,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  cardBody: {
    padding: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  offer: {
    color: '#00796b',
    marginTop: 4,
  },
  points: {
    color: '#555',
    marginTop: 2,
  },
});
