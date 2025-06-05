import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../lib/firebase'; // path to your config file
import { signOut } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { useRouter } from "expo-router";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Image,
} from 'react-native';
import { NativeModules } from 'react-native';
console.log(NativeModules);
import { usePoints } from '../../context/PointsContext'; // ✅ Import your points context
import { collection, getDocs } from 'firebase/firestore';
// Icons as emoji placeholders
const TrophyIcon = () => <Text style={styles.statIcon}>🏆</Text>;
const FriendsIcon = () => <Text style={styles.statIcon}>🧑‍🤝‍🧑</Text>;
const CoinsIcon = () => <Text style={styles.statIcon}>🪙</Text>;

export default function ActivityScreen() {
  // const { points } = usePoints(); // ✅ Use context
  const [adVisible, setAdVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const router = useRouter();
  const [pointHistory, setPointHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const dropdownRef = useRef(null);
  const [userName, setUserName] = useState('');
  const [points, setPoints] = useState(0);
  const [photoURL, setPhotoURL] = useState(null); // 👈 New state for profile pic

  useEffect(() => {
    let intervalId;
    const fetchUserData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setPoints(data.points)
          setUserName(data.name);
          setPointHistory(data.pointHistory || []);
          setPhotoURL(data.photoURL); // 👈 Save the profile picture
        } else {
          console.log('No user document found');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false); // Set loading to false after fetch
      }
    };

    fetchUserData();
    intervalId = setInterval(fetchUserData, 10000);
    return () => clearInterval(intervalId);
  }, []);



  const toggleDropdown = () => setDropdownVisible(!dropdownVisible);
  const goToProfile = () => {
    setDropdownVisible(false);
    router.push("/Profilepage");
  };
  const logout = async () => {
    try {
      await signOut(auth);
      setDropdownVisible(false);
      router.replace("/login"); // or wherever your login page is
    } catch (error) {
      console.error("Logout failed", error);
      alert("Failed to logout. Please try again.");
    }
  };


  const openProfile = () => setProfileVisible(true);
  const closeProfile = () => setProfileVisible(false);

  const handleLogout = () => {
    closeProfile();
    Alert.alert("Logged out", "You have been successfully logged out.");
    // Insert your logout logic here if any other cleanup is needed
  };

  const bonusOffers = [
    { id: '1', title: '50% off Coffee' },
    { id: '2', title: 'Free Ride Upgrade' },
    { id: '3', title: 'Bonus Cashback' },
  ];

  const goToStores = () => router.push("/stores");
  const [friendCount, setFriendCount] = useState(0);
  const [rank, setRank] = useState('N/A');

  useEffect(() => {
    const fetchUserDataAndStats = async () => { // Renamed to avoid confusion with initial fetch
      try {
        const user = auth.currentUser;
        if (!user) return;

        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          // setPoints(data.points); // Points are already updated by the other useEffect
          setUserName(data.name);
          setPhotoURL(data.photoURL);
        }

        // 👥 Count friends
        const friendsSnap = await getDocs(collection(db, 'users', user.uid, 'friends'));
        setFriendCount(friendsSnap.size);

        // 🏆 Calculate rank
        const allUsersSnap = await getDocs(collection(db, 'users'));
        const allPoints = [];
        allUsersSnap.forEach(doc => {
          const data = doc.data();
          if (data.points != null) allPoints.push(data.points);
        });

        allPoints.sort((a, b) => b - a); // descending
        const userRank = allPoints.indexOf(points) + 1; // Use the 'points' state from the other useEffect
        setRank(userRank);
      } catch (error) {
        console.error('Error fetching user data or stats:', error);
      }
    };

    // Initial fetch
    fetchUserDataAndStats();

    // Set interval to refresh every 10 seconds
    const intervalId = setInterval(fetchUserDataAndStats, 10000); // 10,000 ms = 10 sec

    // Clear interval on cleanup
    return () => clearInterval(intervalId);
  }, [points]); // Depend on 'points' so rank updates when points change

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={toggleDropdown}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.profileImage} />
          ) : (
            <View style={styles.profilePicPlaceholder} />
          )}
        </TouchableOpacity>

        <Text style={styles.timeDisplay}>{userName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Dropdown below the top bar */}
      {dropdownVisible && (
        <View style={styles.dropdownBox}>
          <Text style={styles.dropdownItem}>👤 {userName}</Text>
          <TouchableOpacity onPress={goToProfile}>
            <Text style={styles.dropdownItem}>⚙️ Manage Account</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.dropdownItem}>🚪 Logout</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.mainContent}>
        {/* Progress Gauge */}
        <View style={styles.progressGaugeContainer}>
          <View style={styles.progressArc}>
            <Text style={[styles.arcMarker, { top: '5%', left: '47%' }]}>💰</Text>
            <Text style={[styles.arcMarker, { top: '20%', left: '15%', transform: [{ rotate: '-60deg' }] }]}>💰</Text>
            <Text style={[styles.arcMarker, { top: '20%', right: '15%', transform: [{ rotate: '60deg' }] }]}>💰</Text>

            <View style={styles.arcContent}>
              <Text style={styles.arcPanda}>🐼</Text>
              <Text style={styles.arcValue}>{points}</Text>
              <Text style={styles.arcLabel}>Points Earned</Text>
            </View>
          </View>
        </View>
         {/* Go to Games Button */} 
        <TouchableOpacity
          style={[styles.actionButton, styles.gamesButton]} // Apply base actionButton style and specific gamesButton style
          onPress={() => router.replace('../(games)/home')} // Navigate to the games index page
        >
          <Text style={styles.actionButtonText}>🎮 Go to Games</Text>
        </TouchableOpacity>
        

        {/* Convert Points Button */}
        <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/stores')}>
          <Text style={styles.actionButtonText}>Convert My Points</Text>
        </TouchableOpacity>

       
        {/* See Points History Button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/points')} // Navigate to points history page
        >
          <Text style={styles.actionButtonText}>📊 See Points History</Text>
        </TouchableOpacity>

        {/* Stats Cards */}
        <View style={styles.statsCardsContainer}>
          <View style={styles.statCard}>
            <TrophyIcon />
            <Text style={styles.statCardValue}>{rank}</Text>
            <Text style={styles.statCardLabel}>Overall Rank</Text>
          </View>
          <View style={styles.statCard}>
            <FriendsIcon />
            <Text style={styles.statCardValue}>{friendCount}</Text>
            <Text style={styles.statCardLabel}>Friends</Text>
          </View>
          <View style={styles.statCard}>
            <CoinsIcon />
            <Text style={styles.statCardValue}>{points}</Text>
            <Text style={styles.statCardLabel}>Total Points</Text>
          </View>
        </View>


      </ScrollView>


      {/* Profile Modal */}
      <Modal visible={profileVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Pressable style={styles.closeButton} onPress={closeProfile}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{userName}</Text>
            <Text style={{ marginBottom: 20 }}>Manage your account</Text>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => {
                closeProfile();
                router.push("/Profilepage");
              }}
            >
              <Text style={styles.btnPrimaryText}>Manage Account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: '#f44336', marginTop: 12 }]}
              onPress={handleLogout}
            >
              <Text style={styles.btnPrimaryText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Styles are unchanged, so you can keep your existing styles here
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    justifyContent: 'space-between',
  },
  profilePicPlaceholder: {
    width: 40,
    height: 40,
    backgroundColor: '#ccc',
    borderRadius: 20,
  },
  timeDisplay: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },

  mainContent: {
    paddingHorizontal: 20,
    paddingBottom: 40, // reduced from 80 to reduce bottom whitespace
    paddingTop: 20,    // add some top padding to separate from top bar
    alignItems: 'center', // center horizontally all child content
  },

  // Progress Gauge
  progressGaugeContainer: {
    marginTop: 20, // reduced margin top from 40 for less gap
    marginBottom:20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressArc: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#e4f4e7',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  arcMarker: {
    position: 'absolute',
    fontSize: 24,
  },
  arcContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  arcPanda: {
    fontSize: 48,
    marginBottom: 8,
  },
  arcValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  arcLabel: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
  },

  // Button
  actionButton: {
    marginTop: 20, // Adjusted to 20 for consistent spacing between buttons
    backgroundColor: '#4caf50',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  gamesButton: {
    backgroundColor: '#673AB7', // A distinct color for the games button (deep purple)
    marginTop: 20, // Add some space between the two buttons
  },

  // Stats Cards
  statsCardsContainer: {
    marginTop: 30, // reduced from 40 for tighter spacing
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',    // full width for even spacing
    maxWidth: 400,    // limit max width so cards don't spread too far
  },
  statCard: {
    width: 100,
    height: 100,
    borderRadius: 15,
    backgroundColor: '#def7e3',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    marginHorizontal: 5, // add small horizontal margin between cards
  },
  statIcon: {
    fontSize: 30,
  },
  statCardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statCardLabel: {
    fontSize: 14,
    color: '#333',
  },

  // Dropdown Box
  dropdownBox: {
    position: 'absolute',
    top: 60,
    left: 5,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    zIndex: 100,
    width: 180,
  },
  dropdownItem: {
    fontSize: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    top: 8,
  },
  closeButtonText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#666',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: '#4caf50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },

  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  subtitle: {
    fontSize: 20,
    marginTop: 30,
    marginBottom: 10,
    fontWeight: '500',
    color: '#555',
    textAlign: 'center',
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
