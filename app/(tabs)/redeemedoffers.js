import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';

export default function RedeemedOffers() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const user = getAuth().currentUser;

  // Function to fetch offers
  const fetchOffers = async () => {
    try {
      const snapshot = await getDocs(collection(db, `users/${user.uid}/redeemedOffers`));
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOffers(data);
    } catch (error) {
      console.error('Error fetching redeemed offers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchOffers();

    // Set interval to fetch every 30 seconds
    const intervalId = setInterval(fetchOffers, 30000);

    // Cleanup on unmount
    return () => clearInterval(intervalId);
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00796b" />
      </View>
    );
  }

  if (offers.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No redeemed offers yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={offers}
      keyExtractor={(item) => item.storeId}
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() => router.push({ pathname: '/redeemed/[id]', params: { id: item.storeId } })}
        >
          <Image source={{ uri: item.image }} style={styles.image} />
          <View>
            <Text style={styles.name}>{item.storeName}</Text>
            <Text style={styles.offer}>{item.offer}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  offer: {
    color: '#00796b',
  },
});
