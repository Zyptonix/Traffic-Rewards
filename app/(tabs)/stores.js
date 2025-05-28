import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { firebaseApp } from '../../lib/firebase';

const categories = ['All', 'Food', 'Grocery', 'Medicine Stores', 'Maintenance'];

export default function StoresScreen() {
  const router = useRouter();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const db = getFirestore(firebaseApp);
        const querySnapshot = await getDocs(collection(db, 'stores'));
        const storesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStores(storesData);
      } catch (error) {
        console.error('Error fetching stores:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, []);

  const filteredStores = selectedCategory === 'All'
    ? stores
    : stores.filter(store => store.category === selectedCategory);

  // Group filtered stores by category
  const groupedStores = filteredStores.reduce((acc, store) => {
    if (!acc[store.category]) acc[store.category] = [];
    acc[store.category].push(store);
    return acc;
  }, {});

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00796b" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Category filter bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryBar}>
        {categories.map(cat => (
          <Pressable
            key={cat}
            style={[styles.categoryButton, selectedCategory === cat && styles.selectedCategory]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.categoryText, selectedCategory === cat && styles.selectedCategoryText]}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Store Sections */}
      {Object.keys(groupedStores).map((category) => (
        <View key={category} style={styles.categorySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.categoryTitle}>{category}</Text>
            <Pressable onPress={() => router.push(`/storecategory/${category}`)}>
              <Text style={styles.seeAll}>See All</Text>
            </Pressable>
          </View>

          <FlatList
            horizontal
            data={groupedStores[category]}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/store/${item.id}`)}
                style={styles.card}
              >
                <Image source={{ uri: item.image }} style={styles.image} />
                <View style={styles.cardBody}>
                  <Text style={styles.storeName}>{item.name}</Text>
                  <Text style={styles.offerText}>{item.offer}</Text>
                  <Text style={styles.pointsText}>{item.pointsNeeded} Points</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const screenWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBar: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  selectedCategory: {
    backgroundColor: '#00796b',
  },
  categoryText: {
    fontSize: 14,
    color: '#333',
  },
  selectedCategoryText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  categorySection: {
    marginBottom: 22,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#333',
  },
  seeAll: {
    fontSize: 16,
    color: '#00796b',
    fontWeight: '600',
  },
  card: {
    width: screenWidth * 0.6,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginRight: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 130,
  },
  cardBody: {
    padding: 12,
  },
  storeName: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 4,
  },
  offerText: {
    fontSize: 16,
    color: '#00796b',
    marginBottom: 4,
  },
  pointsText: {
    fontSize: 15,
    color: '#666',
  },
});
