import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, Text, Image, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { db,auth } from '../../../lib/firebase'; // make sure this path is correct

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export default function StoreDetails() {
  const { id } = useLocalSearchParams();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStore = async () => {
      try {
        const docRef = doc(db, 'stores', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setStore(docSnap.data());
        } else {
          console.warn('No such store!');
        }
      } catch (error) {
        console.error('Error fetching store:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStore();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00796b" />
      </View>
    );
  }

  if (!store) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Store not found</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image source={{ uri: store.image }} style={styles.image} />
      <Text style={styles.name}>{store.name}</Text>
      <View style={styles.offerBox}>
        <Text style={styles.offer}>{store.offer}</Text>
      </View>
      <Text style={styles.description}>{store.description}</Text>
      <Text style={styles.points}>Points Needed: {store.pointsNeeded}</Text>

      <Pressable
        style={styles.button}
        onPress={async () => {
          try {
           

// Inside your onPress async handler:
const user = auth.currentUser;
const userRef = doc(db, 'users', user.uid);
const offerRef = doc(db, 'users', user.uid, 'redeemedOffers', id);
const redeemedSnap = await getDoc(offerRef);

if (redeemedSnap.exists()) {
  alert('You have already redeemed this offer.');
  return;
}

// Get user points
const userSnap = await getDoc(userRef);
const userData = userSnap.data();
const currentPoints = userData?.points || 0;

console.log('Current points:', currentPoints);
console.log('Points needed:', store.pointsNeeded);

if (currentPoints < store.pointsNeeded) {
  alert('Not enough points to redeem this offer.');
  return;
}

// Deduct points and write redeemed offer
await setDoc(offerRef, {
  storeId: id,
  storeName: store.name,
  offer: store.offer,
  redeemedAt: new Date(),
  pointsSpent: store.pointsNeeded,
  image: store.image,
});

await updateDoc(userRef, {
  points: currentPoints - store.pointsNeeded,
});

alert('Offer successfully redeemed!');

          } catch (error) {
            console.error('Error redeeming offer:', error);
            alert('Failed to redeem offer. Please try again.');
          }
        }}
      >
        <Text style={styles.buttonText}>Redeem Offer</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundText: {
    fontSize: 18,
    color: '#999',
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 20,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#222',
    textAlign: 'center',
  },
  offerBox: {
    backgroundColor: '#e0f7fa',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  offer: {
    fontSize: 20,
    fontWeight: '600',
    color: '#00796b',
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
    marginBottom: 25,
    textAlign: 'center',
  },
  points: {
    fontSize: 16,
    fontWeight: '600',
    color: '#004d40',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#00796b',
    paddingVertical: 15,
    paddingHorizontal: 60,
    borderRadius: 30,
    shadowColor: '#004d40',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
});
