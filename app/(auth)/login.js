import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { auth } from '../../lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { Link, useRouter } from 'expo-router';

export default function ProfileScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Redirect if user is logged in
        router.replace('/../(tabs)/Activity');
      }
    });
    return unsubscribe;
  }, [router]);

  const handleRegister = async () => {
    if (!email || !password) {
      Alert.alert('Please fill in both fields');
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      Alert.alert('Registration Error', error.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Please fill in both fields');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      Alert.alert('Login Error', error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert('Enter your email to reset password');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('Password reset email sent!');
    } catch (error) {
      Alert.alert('Reset Password Error', error.message);
    }
  };

  if (user) {
    // You can optionally keep this UI, but with redirect above, user won't see this
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome, {user.email}</Text>
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>Login</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />

      <Pressable style={styles.loginButton} onPress={handleLogin}>
        <Text style={styles.loginText}>Login</Text>
      </Pressable>

      <View style={styles.inlineRow}>


        <Link href="/(auth)/register">
          <Text style={styles.linkText}>Register</Text>
        </Link>
                <Text style={styles.separator}>|</Text>
        <Link href="/(auth)/reset-password">
          <Text style={styles.linkText}>Forgot Password?</Text>
        </Link>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f7f7f7',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  loginButton: {
    backgroundColor: '#00796b',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 10,
  },
  loginText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    alignItems: 'center',
  },
  linkButton: {
    paddingHorizontal: 6,
  },
  linkText: {
    color: '#00796b',
    fontWeight: '600',
  },
  separator: {
    color: '#aaa',
    marginHorizontal: 4,
  },
  logoutButton: {
    marginTop: 24,
    backgroundColor: '#e53935',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});


