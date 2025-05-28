import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { doc, getDoc,setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { getAuth } from 'firebase/auth';

export default function RedeemedOfferCode() {
  const { id } = useLocalSearchParams();
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = getAuth().currentUser;

  // Helper function to generate a random 13-letter code (if you want to generate locally)
  const generateCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 13; i++) {
      result += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return result;
  };

  useEffect(() => {
    if (!user) return; // Wait for auth

    const fetchOffer = async () => {
      try {
        const docRef = doc(db, `users/${user.uid}/redeemedOffers`, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();

        //   If redeemCode doesn't exist, you could generate here and update Firestore (optional)
          if (!data.redeemCode) {
            const code = generateCode();
            await setDoc(docRef, { redeemCode: code }, { merge: true });
            data.redeemCode = code;
          }

          setOffer(data);
        } else {
          console.warn('No redeemed offer found');
        }
      } catch (error) {
        console.error('Error fetching offer:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOffer();
  }, [id, user]);

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: '#999' }}>Loading user info...</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00796b" />
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Offer not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{offer.name}</Text>
      <Text style={styles.subtitle}>{offer.offer}</Text>
      <Text style={styles.code}>{offer.redeemCode || 'No redeem code available'}</Text>
      <Text style={styles.note}>Show this code at the store to redeem.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#00796b',
    marginBottom: 24,
    textAlign: 'center',
  },
  code: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#004d40',
    backgroundColor: '#e0f2f1',
    padding: 12,
    borderRadius: 10,
  },
  note: {
    marginTop: 20,
    fontSize: 14,
    color: '#888',
  },
});
