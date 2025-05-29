// app/(auth)/verify.js
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged, reload } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });
    return unsubscribe;
  }, []);

  const handleCheckVerified = async () => {
    if (!user) return;
    setVerifying(true);
    try {
      await reload(user);
      const pending = await AsyncStorage.getItem('pendingUser');
        if (!pending) {
        Alert.alert('Missing Info', 'No registration info found. Please register again.');
        return;
        }
        const userData = JSON.parse(pending);

      if (user.emailVerified) {
        // Save user info to Firestore
        await setDoc(doc(db, 'users', user.uid), {
        name: userData.name,
        email: user.email,
        address: userData.address,
        phone: userData.phone,
        photoURL: userData.photoURL,
        });
        await AsyncStorage.removeItem('pendingUser');

        Alert.alert('Success', 'Email verified!');
        router.replace('/(tabs)/Activity');
      } else {
        Alert.alert('Still not verified', 'Please check your email and try again.');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
    setVerifying(false);
    
  };

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify Your Email</Text>
      <Text style={styles.text}>We've sent a verification email to: {user?.email}</Text>
      <Text style={styles.text}>Click below after verifying.</Text>

      <Pressable style={styles.button} onPress={handleCheckVerified}>
        <Text style={styles.buttonText}>
          {verifying ? 'Checking...' : 'I Verified, Continue'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  text: { textAlign: 'center', marginBottom: 12 },
  button: {
    backgroundColor: '#00796b',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontWeight: 'bold' },
});
