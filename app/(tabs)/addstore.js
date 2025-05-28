import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Image, Alert, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import { firebaseApp } from '../../lib/firebase';

const imgbbAPIKey = 'c7c5a6ed14cef23193938da569900b18'; // Replace with your actual imgbb API key

export default function AddStoreScreen() {
  const [name, setName] = useState('');
  const [offer, setOffer] = useState('');
  const [points, setPoints] = useState('');
  const [category, setCategory] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [imageBase64, setImageBase64] = useState(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64);
    }
  };

  const uploadToImgbb = async (base64) => {
    const formData = new FormData();
    formData.append('image', base64);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbAPIKey}`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const data = await response.json();
    if (data.success) return data.data.url;
    else throw new Error('Image upload failed');
  };

  const handleSubmit = async () => {
    if (!name || !offer || !points || !category || !imageUri) {
      Alert.alert('Please fill all fields and select an image.');
      return;
    }

    try {
      setUploading(true);
      const imageUrl = await uploadToImgbb(imageBase64);
      const db = getFirestore(firebaseApp);

      await addDoc(collection(db, 'stores'), {
        name,
        offer,
        pointsNeeded: parseInt(points),
        category,
        image: imageUrl,
      });

      Alert.alert('Store added successfully!');
      setName('');
      setOffer('');
      setPoints('');
      setCategory('');
      setImageUri(null);
    } catch (error) {
      console.error('Error adding store:', error);
      Alert.alert('Failed to add store.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Add New Store</Text>

      <TextInput
        placeholder="Store Name"
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor="#888"
      />
      <TextInput
        placeholder="Offer Description"
        value={offer}
        onChangeText={setOffer}
        style={styles.input}
        placeholderTextColor="#888"
      />
      <TextInput
        placeholder="Points Needed"
        value={points}
        onChangeText={setPoints}
        keyboardType="numeric"
        style={styles.input}
        placeholderTextColor="#888"
      />
      <TextInput
        placeholder="Category (e.g. Food, Fashion)"
        value={category}
        onChangeText={setCategory}
        style={styles.input}
        placeholderTextColor="#888"
      />

      <TouchableOpacity onPress={pickImage} style={styles.button}>
        <Text style={styles.buttonText}>Pick Image</Text>
      </TouchableOpacity>

      {imageUri && (
        <Image source={{ uri: imageUri }} style={styles.preview} />
      )}

      <TouchableOpacity
        onPress={handleSubmit}
        style={[styles.button, uploading && styles.disabledButton]}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Add Store</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 60,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f9f9f9',
    marginBottom: 15,
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
  },
  preview: {
    width: '100%',
    height: 200,
    marginVertical: 15,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    backgroundColor: '#aaa',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
