import React, { useState, useRef, useEffect } from 'react';
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
  SafeAreaView,
  Alert,
  Image,  // <-- Added missing import
} from 'react-native';
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
          setPhotoURL(data.photoURL); // 👈 Save the profile picture
        } else {
          console.log('No user document found');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
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
  const fetchUserData = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
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
      const userRank = allPoints.indexOf(points) + 1;
      setRank(userRank);
    } catch (error) {
      console.error('Error fetching user data or stats:', error);
    }
  };

  // Initial fetch
  fetchUserData();

  // Set interval to refresh every 10 seconds
  const intervalId = setInterval(fetchUserData, 10000); // 10,000 ms = 10 sec

  // Clear interval on cleanup
  return () => clearInterval(intervalId);
}, [points]);

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

        {/* Convert Points Button */}
      <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/stores')}>
        <Text style={styles.actionButtonText}>Convert My Points</Text>
      </TouchableOpacity>

        {/* Stats Cards */}
        <View style={styles.statsCardsContainer}>
          <View style={styles.statCard}>
            <TrophyIcon />
            <Text style={styles.statCardValue}>{rank}</Text>
            <Text style={styles.statCardLabel}>Rank</Text>
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


        {/* Bonus Offers Section */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Traffic Rewards</Text>
        </View>

        <View style={styles.bonusOffersContainer}>
          <Text style={styles.Description}>Claim points as you sit in traffic </Text>
          <Text style={styles.Description}>Use them to get amazing discounts and other lucrative offers at various stores.</Text>
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
                router.push("/ProfilePage");
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
    paddingBottom: 80,
  },

  // Progress Gauge
  progressGaugeContainer: {
    marginTop: 40,
    alignItems: 'center',
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
    marginTop: 40,
    backgroundColor: '#4caf50',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  actionButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },

  // Stats Cards
  statsCardsContainer: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-around',
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

  // Bonus Offers
  sectionTitleRow: {
    marginTop: 50,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    textAlign:'center',

  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  seeAll: {
    fontSize: 16,
    color: '#4caf50',
    fontWeight: '600',
  },
  bonusOffersContainer: {
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  Description: {
    fontSize:16,
     color: 'grey',
    fontWeight: '500',
  },

  loadingText: {
    textAlign: 'center',
    color: '#888',
  },

  // Dropdown Box
  dropdownBox: {
    position: 'absolute',
    top: 60,
    right: 20,
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
  modalBody: {
    marginBottom: 20,
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
});
