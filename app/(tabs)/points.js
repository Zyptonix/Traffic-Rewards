import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase'; // Adjust path as needed

export default function PointsPage() {
  const [points, setPoints] = useState(0);
  const [pointHistory, setPointHistory] = useState([]);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  const auth = getAuth();
  let intervalId;

  const fetchPoints = async () => {
    try {
      const user = auth.currentUser;

      if (!user) {
        console.warn('User not logged in');
        return;
      }

      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setPoints(data.points || 0);
        setPointHistory(data.pointHistory || []);
      } else {
        console.warn('User document does not exist');
      }
    } catch (error) {
      console.error('Error fetching user points:', error);
    } finally {
      setLoading(false);
    }
  };

  fetchPoints(); // Fetch immediately

  // Set up interval for refresh
  intervalId = setInterval(fetchPoints, 5000); // every 10 seconds

  // Cleanup on unmount
  return () => clearInterval(intervalId);
}, []);

  const renderItem = ({ item }) => (
    <View style={styles.historyItem}>
      <Text style={styles.reason}>{item.reason}</Text>
      <Text style={styles.time}>{item.time}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4caf50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Points</Text>
      <Text style={styles.points}>{points}</Text>
      <Text style={styles.subtitle}>Point History</Text>
      <FlatList
        data={pointHistory}
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.historyList}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No points earned yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    backgroundColor: '#f5f7fa',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    color: '#333',
  },
  points: {
    fontSize: 60,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 10,
    color: '#4caf50',
  },
  subtitle: {
    fontSize: 20,
    marginTop: 30,
    marginBottom: 10,
    fontWeight: '500',
    color: '#555',
  },
  historyList: {
    paddingBottom: 20,
  },
  historyItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
  },
  reason: {
    fontSize: 16,
    fontWeight: '500',
    color: '#222',
  },
  time: {
    fontSize: 13,
    color: '#666',
    marginTop: 5,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#999',
    fontStyle: 'italic',
  },
});
