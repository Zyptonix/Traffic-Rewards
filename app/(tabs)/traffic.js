import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Alert,
  TouchableOpacity,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, updateDoc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { usePoints } from '../../context/PointsContext';

// Initialize Firebase outside the component to be accessible by background task
const db = getFirestore();
const auth = getAuth();

// --- Constants for Traffic Logic ---
const GOOGLE_API_KEY = 'AIzaSyBWTvdRIEMQz15-EVi654p5Bpq77wYpDgE'; // <- Replace this with your actual API key

const LOCATION_TRACKING_TASK = 'trafficshare-location-task'; // <-- CHANGED TO UNIQUE NAME
const STUCK_DISTANCE_THRESHOLD_METERS = 30; // Increased to 30 meters
const STUCK_TIME_THRESHOLD_MS = 1000 * 60 * 1; // Reduced to 1 minute (60,000 ms)
const COOLDOWN_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes cooldown between point awards

// --- Traffic Ratio Thresholds (ADJUST THESE BASED ON YOUR OBSERVATIONS) ---
const HEAVY_TRAFFIC_RATIO = 1.5;   // If duration_in_traffic / normal_duration > this, it's heavy traffic
const MODERATE_TRAFFIC_RATIO = 1.10; // If duration_in_traffic / normal_duration > this, it's moderate traffic

const TRAFFIC_CHECK_DISTANCE_METERS = 200; // Distance ahead to check traffic (e.g., 500 for 0.5km)
const ON_ROAD_THRESHOLD_METERS = 10; // New: Distance threshold for being considered "on road"


// --- Helper Functions (moved outside to be accessible by background task) ---

// Haversine formula to calculate distance between two lat/lon points
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Function to get a destination point for traffic status check
function getDestinationFromHeading(lat, lon, heading = 0, distanceMeters = TRAFFIC_CHECK_DISTANCE_METERS) { // Use constant here
  const R = 6371e3;
  const δ = distanceMeters / R;
  const θ = (heading * Math.PI) / 180;

  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );

  return {
    latitude: φ2 * 180 / Math.PI,
    longitude: λ2 * 180 / Math.PI,
  };
}

// Ensure user document has a 'points' field
async function ensureUserPointsField(userDocRef) {
  if (!userDocRef) return;
  const docSnap = await getDoc(userDocRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    if (!('points' in data)) {
      await updateDoc(userDocRef, { points: 0 });
      console.log("TrafficShare: Points field was missing, initialized to 0."); // Unique log
    }
  } else {
    await setDoc(userDocRef, { points: 0, pointHistory: [] });
    console.log("TrafficShare: User doc created with points initialized to 0."); // Unique log
  }
}

// --- Background Task Definition ---
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  const now = Date.now();
  // Keep this line only for the first test

  if (error) {
    console.error(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Location task error:`, error);
    return;
  }
  if (data) {
    const { locations } = data;
    const latestLocation = locations[0].coords;
    console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Lat: ${latestLocation.latitude.toFixed(5)}, Lon: ${latestLocation.longitude.toFixed(5)}`);

    const user = auth.currentUser;
    console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: User UID (check): ${user ? user.uid : 'No user'}`); // <-- ADD THIS LOG
    if (!user) {
      console.warn(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: No user logged in. Skipping point logic.`);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    await ensureUserPointsField(userDocRef);

    // --- Background "Stuck" Detection (Location-based) ---
    let isStuckInBackground = false;
    let currentLastKnownLocationData = await AsyncStorage.getItem('lastKnownLocation');
    let currentLastKnownLocation = currentLastKnownLocationData ? JSON.parse(currentLastKnownLocationData) : null;
    console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Retrieved lastKnownLocation: ${currentLastKnownLocationData}`); // ADD THIS

    if (currentLastKnownLocation) {
      const distance = getDistanceFromLatLonInMeters(
        currentLastKnownLocation.latitude,
        currentLastKnownLocation.longitude,
        latestLocation.latitude,
        latestLocation.longitude
      );
      const timeElapsed = now - currentLastKnownLocation.timestamp;

      console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Last known: Lat ${currentLastKnownLocation.latitude.toFixed(5)}, Lon ${currentLastKnownLocation.longitude.toFixed(5)}, Time: ${new Date(currentLastKnownLocation.timestamp).toLocaleTimeString()}`);
      console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Calculated -> Distance moved: ${distance.toFixed(2)}m, Time elapsed: ${(timeElapsed / 1000).toFixed(0)}s`);

      // Check if stuck
      if (distance < STUCK_DISTANCE_THRESHOLD_METERS && timeElapsed >= STUCK_TIME_THRESHOLD_MS) {
        isStuckInBackground = true;
        console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: User is STUCK! (Condition met: ${distance.toFixed(2)}m < ${STUCK_DISTANCE_THRESHOLD_METERS}m AND ${(timeElapsed / 1000).toFixed(0)}s >= ${(STUCK_TIME_THRESHOLD_MS / 1000).toFixed(0)}s)`);
      } else if (distance >= STUCK_DISTANCE_THRESHOLD_METERS) {
        // User has moved significantly, reset the "stuck" timer and update last known location
        await AsyncStorage.setItem('lastKnownLocation', JSON.stringify({
          latitude: latestLocation.latitude,
          longitude: latestLocation.longitude,
          timestamp: now
        }));
        console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: User moved significantly (${distance.toFixed(2)}m), resetting stuck state and lastKnownLocation.`);
        isStuckInBackground = false; // Ensure it's false if they just moved
      } else {
        // User hasn't moved much but not enough time has passed yet.
        // lastKnownLocation remains as is to continue accumulating time.
        console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Not stuck yet, waiting for time to pass or more movement.`);
      }
    } else {
      // First location update or lastKnownLocation was cleared, initialize it.
      await AsyncStorage.setItem('lastKnownLocation', JSON.stringify({
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude,
        timestamp: now
      }));
      console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Initial lastKnownLocation set.`);
    }

    // --- Background Traffic Status and On-Road Check ---
    let trafficStatus = 'Unknown';
    let isOnRoad = false;
    let snappedLocation = null;

    try {
      const { latitude, longitude, heading } = latestLocation;
      const safeHeading = (heading !== null && heading >= 0 && heading <= 360) ? heading : 0;
      const { latitude: destLat, longitude: destLon } = getDestinationFromHeading(latitude, longitude, safeHeading, TRAFFIC_CHECK_DISTANCE_METERS); // Use constant here

      const trafficUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${latitude},${longitude}&destinations=${destLat},${destLon}&departure_time=now&key=${GOOGLE_API_KEY}`;
      const trafficResponse = await fetch(trafficUrl);
      const trafficData = await trafficResponse.json();

      if (trafficData.rows && trafficData.rows[0] && trafficData.rows[0].elements && trafficData.rows[0].elements[0]) {
        const element = trafficData.rows[0].elements[0];
        const durationInTraffic = element.duration_in_traffic?.value;
        const normalDuration = element.duration?.value;

        const ratio = (normalDuration && normalDuration > 0) ? durationInTraffic / normalDuration : 1;
        console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Traffic Ratio: ${ratio.toFixed(2)} (Traffic: ${durationInTraffic}, Normal: ${normalDuration})`);

        if (ratio > HEAVY_TRAFFIC_RATIO) trafficStatus = 'Heavy Traffic (Red Zone)'; // Use constant
        else if (ratio > MODERATE_TRAFFIC_RATIO) trafficStatus = 'Moderate Traffic (Yellow Zone)'; // Use constant
        else trafficStatus = 'Free Flow (Green Zone)';
      }

      const roadsUrl = `https://roads.googleapis.com/v1/snapToRoads?path=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
      const roadsResponse = await fetch(roadsUrl);
      const roadsData = await roadsResponse.json();

      if (roadsData.snappedPoints && roadsData.snappedPoints.length > 0) {
        const snapped = roadsData.snappedPoints[0].location;
        snappedLocation = { latitude: snapped.latitude, longitude: snapped.longitude };
        const distanceToRoad = getDistanceFromLatLonInMeters(latitude, longitude, snapped.latitude, snapped.longitude);
        isOnRoad = distanceToRoad < ON_ROAD_THRESHOLD_METERS; // Use new ON_ROAD_THRESHOLD_METERS
      }
    } catch (e) {
      console.error(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Traffic/Road API error:`, e);
      trafficStatus = 'Error';
      isOnRoad = false;
    }

    await AsyncStorage.setItem('backgroundTrafficStatus', trafficStatus);
    await AsyncStorage.setItem('backgroundIsOnRoad', JSON.stringify(isOnRoad));
    await AsyncStorage.setItem('backgroundIsStuck', JSON.stringify(isStuckInBackground));
    if (snappedLocation) {
      await AsyncStorage.setItem('backgroundSnappedLocation', JSON.stringify(snappedLocation));
    } else {
      await AsyncStorage.removeItem('backgroundSnappedLocation');
    }


    // --- Point Awarding Logic (Background) ---
    let lastPointTimeData = await AsyncStorage.getItem('lastPointTime');
    let lastPointTime = lastPointTimeData ? parseInt(lastPointTimeData) : 0;

    const cooldownReady = now - lastPointTime >= COOLDOWN_INTERVAL_MS;

    const inRedZone = trafficStatus === 'Heavy Traffic (Red Zone)';
    const inYellowZone = trafficStatus === 'Moderate Traffic (Yellow Zone)';

    console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Point Check -> Stuck: ${isStuckInBackground}, Cooldown Ready: ${cooldownReady}, On Road: ${isOnRoad}, Red Zone: ${inRedZone}, Yellow Zone: ${inYellowZone}`);

    if (isStuckInBackground && cooldownReady && isOnRoad) {
      let pointsToAdd = 0;
      let reason = '';

      if (inRedZone) {
        pointsToAdd = 10;
        reason = 'Stuck in heavy traffic on road (Background)';
      } else if (inYellowZone) {
        pointsToAdd = 5;
        reason = 'Stuck in moderate traffic on road (Background)';
      }

      if (pointsToAdd > 0) {
        try {
          const docSnap = await getDoc(userDocRef);
          let latestPoints = 0;
          if (docSnap.exists()) {
            latestPoints = docSnap.data().points ?? 0;
          }

          const newPoints = latestPoints + pointsToAdd;
          await updateDoc(userDocRef, { points: newPoints, pointHistory: arrayUnion({ time: new Date().toLocaleString(), reason }), lastPointTime: now });
          await AsyncStorage.setItem('lastPointTime', now.toString());

          console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: AWARDED ${pointsToAdd} points! New total: ${newPoints}. Reason: ${reason}`);

        } catch (error) {
          console.error(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Error updating points:`, error);
        }
      }
    }
  }
  
});


// --- TrafficPage Component ---
export default function TrafficPage() {
  const { points, setPoints, lastPointTime, setLastPointTime, loading } = usePoints();
  const [trafficKey, setTrafficKey] = useState(0);
  const [location, setLocation] = useState(null); // Current foreground location
  const [snappedLocation, setSnappedLocation] = useState(null); // Snapped location for foreground map
  const [trafficStatus, setTrafficStatus] = useState('Unknown'); // Foreground traffic status
  const [isOnRoad, setIsOnRoad] = useState(false); // Foreground on-road status
  const [isStuck, setIsStuck] = useState(false); // Foreground stuck status
  const [cooldownLeft, setCooldownLeft] = useState(null);

  const bannerAnim = useRef(new Animated.Value(0)).current;
  const [bannerText, setBannerText] = useState('');

  const user = auth.currentUser;
  const userDocRef = user ? doc(db, 'users', user.uid) : null;

  useEffect(() => {
    if (userDocRef) {
      ensureUserPointsField(userDocRef).catch(console.error);
    }
  }, [userDocRef]);

  // --- Foreground Location and Background Task Management ---
  useEffect(() => {
    const requestPermissionsAndStartTracking = async () => {
      console.log('TrafficShare-Foreground: Requesting foreground permissions...'); // New log
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Foreground location access is required for map and initial checks.');
        console.error('TrafficShare-Foreground: Foreground permission denied.'); // New log
        return;
      }
      console.log('TrafficShare-Foreground: Foreground permissions granted.'); // New log

      console.log('TrafficShare-Foreground: Requesting background permissions...'); // New log
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Background location access is required to award points when the app is closed.');
        console.error('TrafficShare-Foreground: Background permission denied.'); // New log
        return;
      }
      console.log('TrafficShare-Foreground: Background permissions granted.'); // New log


      // Start foreground location watch for map display
      const foregroundSubscriber = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 10, timeInterval: 10000 },
        (locUpdate) => {
          setLocation(locUpdate.coords);
          console.log(`[${new Date().toLocaleTimeString()}] TrafficShare-Foreground: Current Location: ${locUpdate.coords.latitude.toFixed(5)}, ${locUpdate.coords.longitude.toFixed(5)}`); // New log for foreground
        }
      );

      // Start background location task
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
      console.log(`TrafficShare-Foreground: Background task registered status: ${isTaskRegistered}`); // New log
      if (!isTaskRegistered) {
        console.log('TrafficShare-Foreground: Attempting to start background location updates...'); // New log
        try {
          await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 50, // Update every 50 meters
            timeInterval: 10000, // Background updates every 10 seconds
            deferredUpdatesInterval: 10000, // Defer updates for 10 seconds to batch them
            foregroundService: {
              notificationTitle: 'TrafficShare',
              notificationBody: 'Tracking your location for traffic points',
              notificationColor: '#4caf50',
            },
          });
          console.log('TrafficShare-Foreground: Background location task started successfully.'); // New log
        } catch (e) {
          console.error('TrafficShare-Foreground: Error starting background location task:', e); // New error log
        }
      } else {
        console.log('TrafficShare-Foreground: Background location task already registered, not restarting.'); // New log
      }

      return () => {
        if (foregroundSubscriber) foregroundSubscriber.remove();
        // You might want to stop the background task if the component unmounts
        // or based on app lifecycle, but for continuous tracking, it's often left running.
        // For testing, you might want to stop it explicitly sometimes.
        // TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK).then(isRegistered => {
        //   if (isRegistered) Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
        // });
      };
    };

    requestPermissionsAndStartTracking();
  }, []);

  // --- Foreground UI Updates from Background Task Results ---
  useEffect(() => {
    const updateForegroundUI = async () => {
      const currentTrafficStatus = await AsyncStorage.getItem('backgroundTrafficStatus');
      const currentIsOnRoad = await AsyncStorage.getItem('backgroundIsOnRoad');
      const currentIsStuck = await AsyncStorage.getItem('backgroundIsStuck');
      const currentSnappedLocation = await AsyncStorage.getItem('backgroundSnappedLocation');
      const currentLastPointTime = await AsyncStorage.getItem('lastPointTime');

      if (currentTrafficStatus) setTrafficStatus(currentTrafficStatus);
      if (currentIsOnRoad !== null) setIsOnRoad(JSON.parse(currentIsOnRoad));
      if (currentIsStuck !== null) setIsStuck(JSON.parse(currentIsStuck));
      if (currentSnappedLocation) setSnappedLocation(JSON.parse(currentSnappedLocation));
      if (currentLastPointTime !== null) setLastPointTime(parseInt(currentLastPointTime));

      if (userDocRef) {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPoints(data.points ?? 0);
        }
      }
    };

    updateForegroundUI();
    const uiUpdateInterval = setInterval(updateForegroundUI, 5000);

    return () => clearInterval(uiUpdateInterval);
  }, [userDocRef, setPoints, setLastPointTime]);

  // Cooldown timer for display
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now(); // Corrected from Date.Now()
      const remaining = COOLDOWN_INTERVAL_MS - (now - lastPointTime);
      setCooldownLeft(remaining > 0 ? remaining : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [lastPointTime]);

  // Banner display logic
  const showBanner = (text) => {
    setBannerText(text);
    Animated.sequence([
      Animated.timing(bannerAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(bannerAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start();
  };

  // Function to manually refresh map traffic layer and foreground data
  const refreshTrafficLayer = useCallback(() => {
    setTrafficKey(prev => prev + 1); // Increment key to force MapView remount
    // Manually trigger the foreground update logic
    // This will re-fetch traffic and road status for the UI immediately
    if (location) { // Only fetch if location is available
      const { latitude, longitude, heading } = location;
      const safeHeading = (heading !== null && heading >= 0 && heading <= 360) ? heading : 0;
      const { latitude: destLat, longitude: destLon } = getDestinationFromHeading(latitude, longitude, safeHeading, TRAFFIC_CHECK_DISTANCE_METERS);

      // Re-run the traffic and road status fetching logic directly
      // This is a simplified version of fetchTrafficAndRoadStatus for immediate UI update
      (async () => {
        try {
          const trafficUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${latitude},${longitude}&destinations=${destLat},${destLon}&departure_time=now&key=${GOOGLE_API_KEY}`;
          const trafficResponse = await fetch(trafficUrl);
          const trafficData = await trafficResponse.json();

          if (trafficData.rows && trafficData.rows[0] && trafficData.rows[0].elements && trafficData.rows[0].elements[0]) {
            const element = trafficData.rows[0].elements[0];
            const durationInTraffic = element.duration_in_traffic?.value;
            const normalDuration = element.duration?.value;

            const ratio = (normalDuration && normalDuration > 0) ? durationInTraffic / normalDuration : 1;

            if (ratio > HEAVY_TRAFFIC_RATIO) setTrafficStatus('Heavy Traffic (Red Zone)');
            else if (ratio > MODERATE_TRAFFIC_RATIO) setTrafficStatus('Moderate Traffic (Yellow Zone)');
            else setTrafficStatus('Free Flow (Green Zone)');
          } else {
            setTrafficStatus('Traffic data unavailable');
          }

          const roadsUrl = `https://roads.googleapis.com/v1/snapToRoads?path=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
          const roadsResponse = await fetch(roadsUrl);
          const roadsData = await roadsResponse.json();

          if (roadsData.snappedPoints && roadsData.snappedPoints.length > 0) {
            const snapped = roadsData.snappedPoints[0].location;
            setSnappedLocation({ latitude: snapped.latitude, longitude: snapped.longitude });
            const distanceToRoad = getDistanceFromLatLonInMeters(latitude, longitude, snapped.latitude, snapped.longitude);
            setIsOnRoad(distanceToRoad < ON_ROAD_THRESHOLD_METERS); // Corrected to use ON_ROAD_THRESHOLD_METERS
          } else {
            setIsOnRoad(false);
            setSnappedLocation(null);
          }
        } catch (e) {
          console.error('Manual refresh error:', e);
          setTrafficStatus('Error fetching traffic');
          setIsOnRoad(false);
        }
      })();
    }
  }, [location]); // Depend on location for the manual refresh to use current location

  useEffect(() => {
    // This useEffect was for automatic map layer refresh every minute.
    // Keeping it if you want both automatic and manual.
    const id = setInterval(() => {
      setTrafficKey(prev => prev + 1);
    }, 60000);
    return () => clearInterval(id);
  }, []);

  if (loading || !location) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Loading location and points...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        key={trafficKey}
        style={styles.map}
        showsTraffic={true}
        region={
          location
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }
            : undefined
        }
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {snappedLocation && <Marker coordinate={snappedLocation} pinColor="blue" />}
      </MapView>

      <View style={styles.info}>
        <Text style={styles.header}>Points: {points}</Text>
        <Text>Traffic: {trafficStatus}</Text>
        <Text>Stuck: {isStuck ? 'Yes' : 'No'}</Text>
        <Text>Cooldown: {cooldownLeft !== null ? Math.ceil(cooldownLeft / 1000) + 's' : '...'}</Text>
        <Text>On Road: {isOnRoad ? 'Yes' : 'No'}</Text>
        {/* Distance to Road calculation is internal to background task, not directly displayed in UI */}

        {/* Refresh Button */}
        <TouchableOpacity onPress={refreshTrafficLayer} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>🔄 Refresh Traffic</Text>
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.banner,
          {
            opacity: bannerAnim,
            transform: [
              {
                translateY: bannerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-50, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.bannerText}>{bannerText}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  info: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 10,
    borderRadius: 8,
    elevation: 5,
    zIndex: 2,
  },
  header: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: '#4caf50',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  bannerText: {
    color: 'white',
    fontWeight: 'bold',
  },
  refreshButton: {
    marginTop: 10,
    backgroundColor: '#007bff', // Blue color for the button
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    alignSelf: 'flex-start', // Align to start of info box
  },
  refreshButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});