import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";

import * as Location from "expo-location";
import { auth, db } from "../../lib/firebase"; // your firebase config
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "expo-router"; // for navigation

export default function ProfileScreen() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchUserData() {
      try {
        const user = auth.currentUser;
        if (!user) {
          Alert.alert("Error", "No logged in user");
          setLoading(false);
          return;
        }
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        } else {
          setUserData({
            username: user.email.split("@")[0],
            photoURL: null,
            joinedDate: null,
          });
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        Alert.alert("Error", "Failed to load user data");
      }
      setLoading(false);
    }
    fetchUserData();
  }, []);

  useEffect(() => {
    async function requestLocationPermission() {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        setLocationPermissionGranted(newStatus === "granted");
        if (newStatus !== "granted") {
          Alert.alert("Permission Denied", "Location permission is required for this app.");
        }
      } else {
        setLocationPermissionGranted(true);
      }
    }
    requestLocationPermission();
  }, []);

  const onLogout = () => {
    signOut(auth)
      .then(() => {
        Alert.alert("Logged Out", "You have been signed out.");
        router.replace("/login"); // navigate to login screen after logout
      })
      .catch((error) => {
        Alert.alert("Error", error.message);
      });
  };

  const goToStores = () => {
    router.push("/stores"); // navigate to stores screen
  };

  // Dummy handlers for links - replace with real navigation if available
  const openTerms = () => Alert.alert("Terms & Conditions", "Display Terms & Conditions here.");
  const openPrivacy = () => Alert.alert("Privacy Policy", "Display Privacy Policy here.");
  const openAbout = () => Alert.alert("About TrafficShare", "Display info about the app.");

  if (loading) {
    return (
      <View style={styles.centered}>
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color="#4caf50" />
          <View style={styles.profilePicPlaceholder}>
            <Text style={styles.profilePicInitial}>🐼</Text>
          </View>
        </View>
        <Text style={{ marginTop: 15, fontSize: 16, color: "#555" }}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>


      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
        {userData?.photoURL ? (
            <Image
            source={{ uri: userData.photoURL }}
            style={styles.profilePicLarge}
            />
        ) : (
            <View style={styles.profilePicPlaceholder}>
            <Text style={styles.profilePicInitial}>
                {userData?.name?.charAt(0).toUpperCase() || "U"}
            </Text>
            </View>
        )}
        <Text style={styles.username}>{userData?.name || "Name not set"}</Text>
        <Text style={styles.email}>{userData?.email || "Email not set"}</Text>
        <Text style={styles.phone}>Phone: {userData?.phone || "N/A"}</Text>
        <Text style={styles.address}>Address: {userData?.address || "N/A"}</Text>
        </View>


        {/* App Settings */}
        <View style={styles.contentCard}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Location Access</Text>
            <Text
              style={[
                styles.settingValue,
                { color: locationPermissionGranted ? "#4caf50" : "#d9534f" },
              ]}
            >
              {locationPermissionGranted ? "Granted" : "Not Granted (Required)"}
            </Text>
          </View>
        </View>

        {/* Rewards button */}
        <TouchableOpacity style={styles.showRewardsBtn} onPress={goToStores} activeOpacity={0.8}>
          <Text style={styles.showRewardsBtnText}>Show All Rewards</Text>
        </TouchableOpacity>

        {/* Other Links */}
        <View style={styles.contentCard}>
          <Text style={styles.sectionTitle}>Other</Text>
          <TouchableOpacity style={styles.linkItem} onPress={openTerms}>
            <Text style={styles.linkText}>Terms & Conditions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem} onPress={openPrivacy}>
            <Text style={styles.linkText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem} onPress={openAbout}>
            <Text style={styles.linkText}>About TrafficShare</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.btnDanger} onPress={onLogout} activeOpacity={0.8}>
          <Text style={styles.btnDangerText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// Ionicons is imported for bottom navigation icons if you want to add a nav bar
import { Ionicons } from "@expo/vector-icons";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120, // space for bottom nav if added later
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: 30,
  },
  profilePicLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
  },
  profilePicPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e0f2f1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  profilePicInitial: {
    fontSize: 50,
    fontWeight: "700",
    color: "#4caf50",
  },
  username: {
    fontSize: 28,
    fontWeight: "700",
    color: "#333",
    marginBottom: 6,
  },
  joinedDate: {
    fontSize: 16,
    color: "#777",
  },

  contentCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 18,
    color: "#222",
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  settingLabel: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  settingValue: {
    fontSize: 16,
    color: "#666",
  },

  linkItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  linkText: {
    fontSize: 16,
    color: "#4caf50",
    fontWeight: "600",
  },

  btnDanger: {
    backgroundColor: "#d9534f",
    borderRadius: 25,
    paddingVertical: 14,
    marginTop: 10,
    alignItems: "center",
    shadowColor: "#d9534f",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  btnDangerText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
  },

  loadingWrapper: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },

  topRightUserInfo: {
    position: "absolute",
    top: 12,
    right: 20,
    zIndex: 10,
    backgroundColor: "#e0f2f1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#4caf50",
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  topRightText: {
    fontWeight: "700",
    color: "#4caf50",
    fontSize: 14,
  },

  showRewardsBtn: {
    backgroundColor: "#4caf50",
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 25,
    shadowColor: "#4caf50",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  },
  showRewardsBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
  },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  email: {
  fontSize: 16,
  color: "#555",
  marginBottom: 4,
},
phone: {
  fontSize: 16,
  color: "#555",
  marginBottom: 4,
},
address: {
  fontSize: 16,
  color: "#555",
  marginBottom: 4,
},

});
