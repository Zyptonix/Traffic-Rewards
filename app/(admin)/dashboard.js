import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { db } from '../../lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const router = useRouter();
export default function AdminDashboard() {


  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);

  // Fetch users
  const fetchUsers = async () => {
    try {
      const userSnapshot = await getDocs(collection(db, 'users'));
      const userList = userSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setUsers(userList);
    } catch (error) {
      Alert.alert('Error fetching users', error.message);
    }
  };

  // Fetch stores
  const fetchStores = async () => {
    try {
      const storeSnapshot = await getDocs(collection(db, 'stores'));
      const storeList = storeSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setStores(storeList);
    } catch (error) {
      Alert.alert('Error fetching stores', error.message);
    }
  };

useEffect(() => {
  fetchUsers();
  fetchStores();

  const interval = setInterval(() => {
    fetchUsers();
    fetchStores();
  }, 10000); // every 10 seconds

  return () => clearInterval(interval); // cleanup
}, []);
  const handleDeleteUser = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', id));
      Alert.alert('User deleted');
      fetchUsers();
    } catch (error) {
      Alert.alert('Error deleting user', error.message);
    }
  };

  const handleDeleteStore = async (id) => {
    try {
      await deleteDoc(doc(db, 'stores', id));
      Alert.alert('Store deleted');
      fetchStores();
    } catch (error) {
      Alert.alert('Error deleting store', error.message);
    }
  };

  const renderItem = (item, onDelete, labelFields = []) => (
    <View style={styles.card}>
      {labelFields.map((field) => (
        <Text key={field} style={styles.itemText}>
          <Text style={styles.label}>{field}: </Text>
          {item[field] || 'N/A'}
        </Text>
      ))}
      <Pressable style={styles.deleteButton} onPress={() => onDelete(item.id)}>
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView>
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Admin Dashboard</Text>

      <Text style={styles.sectionTitle}>Users</Text>
      {users.length === 0 ? (
        <Text style={styles.emptyText}>No users found</Text>
      ) : (
        users.map((user) => (
        <View key={user.id}>
            {renderItem(user, handleDeleteUser, ['name', 'email'])}
        </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Stores</Text>
      <Pressable style={styles.addButton} onPress={() => router.push('/(admin)/add-store')}>
        <Text style={styles.addButtonText}>➕ Add Store</Text>
        </Pressable>

      {stores.length === 0 ? (
        <Text style={styles.emptyText}>No stores found</Text>
      ) : 
        stores.map((store) => (
        <View key={store.id}>
            {renderItem(store, handleDeleteStore, ['name', 'address', 'category'])}
        </View>
        ))}
        <Pressable style={styles.logoutButton} onPress={() => router.replace('/login')}>
            <Text style={styles.logoutButtonText}>🔒 Logout</Text>
        </Pressable>

    </ScrollView>
   </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fafafa',
  },
  heading: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#333',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginVertical: 12,
    color: '#555',
  },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  itemText: {
    fontSize: 16,
    marginBottom: 6,
    color: '#444',
  },
  label: {
    fontWeight: '600',
  },
  deleteButton: {
    marginTop: 8,
    backgroundColor: '#d32f2f',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    fontStyle: 'italic',
    color: '#999',
    marginBottom: 10,
  },
  addButton: {
  backgroundColor: '#00796b',
  paddingVertical: 10,
  paddingHorizontal: 20,
  borderRadius: 8,
  alignItems: 'center',
  marginBottom: 16,
  alignSelf: 'center',
},
addButtonText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '600',
},
logoutButton: {
  backgroundColor: '#e53935',
  paddingVertical: 10,
  paddingHorizontal: 20,
  borderRadius: 8,
  alignItems: 'center',
  marginBottom: 12,
  alignSelf: 'center',
},
logoutButtonText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '600',
},

});
