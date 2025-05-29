import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image as RNImage, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase'; // adjust path to your config
import { useRouter } from 'expo-router'; // <-- added this import
import { sendEmailVerification, reload } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IMGBB_API_KEY = 'c7c5a6ed14cef23193938da569900b18'; // Replace this

const RegisterScreen = () => {
  const router = useRouter(); // <-- initialize router

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [image, setImage] = useState(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const uploadToImgbb = async (uri) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const formData = new FormData();
      formData.append('image', base64);

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = await response.json();
      if (data.success) return data.data.url;
      else throw new Error(data.error.message);
    } catch (error) {
      throw new Error('ImgBB upload failed: ' + error.message);
    }
  };

 const handleRegister = async () => {
  if (!name || !address || !phone || !email || !password || !confirmPassword || !image) {
    Alert.alert('Error', 'Please fill all fields and upload a profile picture.');
    return;
  }

  if (password !== confirmPassword) {
    Alert.alert('Error', 'Passwords do not match.');
    return;
  }

  try {
    const imageUrl = await uploadToImgbb(image);

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Send email verification
    await sendEmailVerification(user);

    // Temporarily store user details in async storage or global state (optional)
    // For now, just pass them via router query (not secure, better to cache locally or handle on verify page)
    await AsyncStorage.setItem('pendingUser', JSON.stringify({
      name,
      address,
      phone,
      email,
      photoURL: imageUrl,
    }));

    Alert.alert(
      'Verify Your Email',
      'A verification email has been sent to your email address. Please verify before proceeding.',
      
      [{ text: 'OK', onPress: () => router.replace('/(auth)/verify') }]
    );
  } catch (error) {
    Alert.alert('Registration Error', error.message);
  }
};

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Register</Text>

      <TextInput placeholder="Name" value={name} onChangeText={setName} style={styles.input} />
      <TextInput placeholder="Address" value={address} onChangeText={setAddress} style={styles.input} />
      <TextInput placeholder="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
      <TextInput placeholder="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry style={styles.input} />

      <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
        {image ? <RNImage source={{ uri: image }} style={styles.image} /> : <Text>Upload Profile Picture</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleRegister} style={styles.button}>
        <Text style={styles.buttonText}>Register</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/login')} style={{ marginTop: 15 }}>
        <Text style={{ textAlign: 'center' }}>Already have an account? Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = {
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  imagePicker: {
    height: 150,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
};

export default RegisterScreen;
