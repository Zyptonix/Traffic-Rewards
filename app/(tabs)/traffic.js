import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Animated,
    Alert,
    TouchableOpacity,
    Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, updateDoc, setDoc, getDoc, arrayUnion, increment } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import Constants from 'expo-constants'; 
// Initialize Firebase outside the component to be accessible by background task
// IMPORTANT: Ensure Firebase is properly initialized in your app's entry point (e.g., App.js)
// before these are called.
const db = getFirestore();
const auth = getAuth();

// --- Constants for Traffic Logic ---
const GOOGLE_API_KEY = Constants.expoConfig.extra.GOOGLE_API_KEY;
// Unique task name for Expo's TaskManager
const LOCATION_TRACKING_TASK = 'trafficshare-location-task';

// Thresholds for determining if the user is "stuck"
const STUCK_DISTANCE_THRESHOLD_METERS = 30; // User must move less than this distance
const STUCK_TIME_THRESHOLD_MS = 1000 * 60 * 1; // User must be stationary for at least 1 minute (60,000 ms)

// Cooldown period between awarding points to prevent rapid point accumulation
const COOLDOWN_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes (300,000 ms) cooldown

// Traffic ratio thresholds for categorizing traffic severity
const HEAVY_TRAFFIC_RATIO = 1.5;    // If duration_in_traffic / normal_duration > this, it's heavy traffic
const MODERATE_TRAFFIC_RATIO = 1.10; // If duration_in_traffic / normal_duration > this, it's moderate traffic

// Distance ahead to check traffic status using Google Distance Matrix API
const TRAFFIC_CHECK_DISTANCE_METERS = 30;

// Distance threshold for snapping to roads (how close to a road is considered "on road")
const ON_ROAD_THRESHOLD_METERS = 10;

// Minimum interval between Google API calls in the background task
const MIN_API_CALL_INTERVAL_MS_TRAFFIC = 1000 * 30; // 30 seconds for traffic API
const MIN_API_CALL_INTERVAL_MS_ROADS = 1000 * 60;   // 1 minute for roads API


// --- Helper Functions (moved outside to be accessible by background task context) ---

/**
 * Calculates the distance between two geographical coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of point 1.
 * @param {number} lon1 Longitude of point 1.
 * @param {number} lat2 Latitude of point 2.
 * @param {number} lon2 Longitude of point 2.
 * @returns {number} Distance in meters.
 */
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const toRad = (v) => (v * Math.PI) / 180; // Converts degrees to radians
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Calculates a destination point given a starting point, heading, and distance.
 * Useful for checking traffic ahead in a specific direction.
 * @param {number} lat Latitude of the starting point.
 * @param {number} lon Longitude of the starting point.
 * @param {number} heading Compass heading in degrees (0-360).
 * @param {number} distanceMeters Distance to project forward in meters.
 * @returns {{latitude: number, longitude: number}} The calculated destination coordinates.
 */
function getDestinationFromHeading(lat, lon, heading = 0, distanceMeters = TRAFFIC_CHECK_DISTANCE_METERS) {
    const R = 6371e3; // Earth's radius in meters
    const δ = distanceMeters / R; // Angular distance in radians
    const θ = (heading * Math.PI) / 180; // Heading in radians

    const φ1 = (lat * Math.PI) / 180; // Latitude in radians
    const λ1 = (lon * Math.PI) / 180; // Longitude in radians

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) +
        Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(
        Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
        Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

    return {
        latitude: φ2 * 180 / Math.PI, // Convert back to degrees
        longitude: λ2 * 180 / Math.PI, // Convert back to degrees
    };
}

/**
 * Ensures that a user's document in Firestore has a 'points' field, initializing it to 0 if missing.
 * Also initializes 'pointHistory' if the document is new.
 * @param {object} userDocRef Firestore DocumentReference for the user.
 */
async function ensureUserPointsField(userDocRef) {
    if (!userDocRef) {
        console.warn("TrafficShare: ensureUserPointsField called with null userDocRef.");
        return;
    }
    try {
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (!('points' in data)) {
                await updateDoc(userDocRef, { points: 0 });
                console.log("TrafficShare: Points field was missing, initialized to 0.");
            }
            if (!('pointHistory' in data)) {
                await updateDoc(userDocRef, { pointHistory: [] });
                console.log("TrafficShare: Point history field was missing, initialized to empty array.");
            }
        } else {
            // If document doesn't exist, create it with initial points and history
            await setDoc(userDocRef, { points: 0, pointHistory: [] });
            console.log("TrafficShare: User doc created with points initialized to 0 and empty history.");
        }
    } catch (error) {
        console.error("TrafficShare: Error ensuring user points field:", error);
    }
}

// --- Background Task Definition ---
// This task runs even when the app is in the background or closed.
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
    const now = Date.now();
    console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Task executed.`); // Log for every task execution

    if (error) {
        console.error(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Location task error:`, error);
        return;
    }

    if (data) {
        const { locations } = data;
        const latestLocation = locations[0].coords;
        console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Lat: ${latestLocation.latitude.toFixed(5)}, Lon: ${latestLocation.longitude.toFixed(5)}`);

        // Attempt to get the current authenticated user.
        const user = auth.currentUser;
        console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: User UID (check): ${user ? user.uid : 'No user'}`);
        if (!user) {
            console.warn(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: No user logged in. Skipping point logic.`);
            return; // Exit if no user is authenticated
        }

        const userDocRef = doc(db, 'users', user.uid);
        await ensureUserPointsField(userDocRef); // Ensure user's points field exists

        // --- Background "Stuck" Detection (Location-based) ---
        let isStuckInBackground = false;
        let currentLastKnownLocationData = await AsyncStorage.getItem('lastKnownLocation');
        let currentLastKnownLocation = currentLastKnownLocationData ? JSON.parse(currentLastKnownLocationData) : null;
        console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Retrieved lastKnownLocation: ${currentLastKnownLocationData}`);

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

            // Check if user is stuck based on distance and time thresholds
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

        // --- Background Traffic Status and On-Road Check (THROTTLED API CALLS) ---
        let trafficStatus = 'Unknown';
        let isOnRoad = false;
        let snappedLocation = null;

        let lastTrafficApiCallTime = parseInt(await AsyncStorage.getItem('lastTrafficApiCallTime') || '0');
        let lastRoadsApiCallTime = parseInt(await AsyncStorage.getItem('lastRoadsApiCallTime') || '0');

        const canCallTrafficApi = (now - lastTrafficApiCallTime) >= MIN_API_CALL_INTERVAL_MS_TRAFFIC;
        const canCallRoadsApi = (now - lastRoadsApiCallTime) >= MIN_API_CALL_INTERVAL_MS_ROADS;

        // Try to fetch traffic data if cooldown is ready or if it's the first call
        if (canCallTrafficApi) {
            try {
                const { latitude, longitude, heading } = latestLocation;
                const safeHeading = (heading !== null && heading >= 0 && heading <= 360) ? heading : 0;
                const { latitude: destLat, longitude: destLon } = getDestinationFromHeading(latitude, longitude, safeHeading, TRAFFIC_CHECK_DISTANCE_METERS);

                const trafficUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${latitude},${longitude}&destinations=${destLat},${destLon}&departure_time=now&key=${GOOGLE_API_KEY}`;
                const trafficResponse = await fetch(trafficUrl);
                const trafficData = await trafficResponse.json();

                if (trafficData.rows && trafficData.rows[0] && trafficData.rows[0].elements && trafficData.rows[0].elements[0]) {
                    const element = trafficData.rows[0].elements[0];
                    const durationInTraffic = element.duration_in_traffic?.value;
                    const normalDuration = element.duration?.value;

                    const ratio = (normalDuration && normalDuration > 0) ? durationInTraffic / normalDuration : 1;
                    console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Traffic Ratio: ${ratio.toFixed(2)} (Traffic: ${durationInTraffic}, Normal: ${normalDuration})`);

                    if (ratio > HEAVY_TRAFFIC_RATIO) trafficStatus = 'Heavy Traffic (Red Zone)';
                    else if (ratio > MODERATE_TRAFFIC_RATIO) trafficStatus = 'Moderate Traffic (Yellow Zone)';
                    else trafficStatus = 'Free Flow (Green Zone)';
                } else {
                    trafficStatus = 'Traffic data unavailable';
                    console.warn(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Traffic data unavailable from API.`);
                }
                await AsyncStorage.setItem('lastTrafficApiCallTime', now.toString()); // Update last call time
            } catch (e) {
                console.error(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Traffic API error:`, e);
                trafficStatus = 'Error';
            }
        } else {
            // If not calling API, try to use last known status
            trafficStatus = await AsyncStorage.getItem('backgroundTrafficStatus') || 'Unknown';
            console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Throttling Traffic API. Using cached status: ${trafficStatus}`);
        }

        // Try to fetch roads data if cooldown is ready or if it's the first call
        if (canCallRoadsApi) {
            try {
                const { latitude, longitude } = latestLocation;
                const roadsUrl = `https://roads.googleapis.com/v1/snapToRoads?path=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
                const roadsResponse = await fetch(roadsUrl);
                const roadsData = await roadsResponse.json();

                if (roadsData.snappedPoints && roadsData.snappedPoints.length > 0) {
                    const snapped = roadsData.snappedPoints[0].location;
                    snappedLocation = { latitude: snapped.latitude, longitude: snapped.longitude };
                    const distanceToRoad = getDistanceFromLatLonInMeters(latitude, longitude, snapped.latitude, snapped.longitude);
                    isOnRoad = distanceToRoad < ON_ROAD_THRESHOLD_METERS; // Check if current location is close to a road
                    console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Distance to Road: ${distanceToRoad.toFixed(2)}m, On Road: ${isOnRoad}`);
                } else {
                    isOnRoad = false;
                    snappedLocation = null;
                    console.warn(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: No snapped road data found.`);
                }
                await AsyncStorage.setItem('lastRoadsApiCallTime', now.toString()); // Update last call time
            } catch (e) {
                console.error(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Roads API error:`, e);
                isOnRoad = false;
                snappedLocation = null;
            }
        } else {
            // If not calling API, try to use last known status
            isOnRoad = JSON.parse(await AsyncStorage.getItem('backgroundIsOnRoad') || 'false');
            snappedLocation = JSON.parse(await AsyncStorage.getItem('backgroundSnappedLocation') || 'null');
            console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Throttling Roads API. Using cached status: On Road: ${isOnRoad}`);
        }

        // Store background task results in AsyncStorage for foreground UI to consume
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
                    await AsyncStorage.setItem('lastPointTime', now.toString()); // Update last point time in AsyncStorage

                    console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: AWARDED ${pointsToAdd} points! New total: ${newPoints}. Reason: ${reason}`);

                } catch (error) {
                    console.error(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Error updating points:`, error);
                }
            } else {
                console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Stuck but not in Red/Yellow zone, no points awarded.`);
            }
        } else {
            console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: Conditions not met for point award. Stuck: ${isStuckInBackground}, Cooldown Ready: ${cooldownReady}, On Road: ${isOnRoad}`);
        }
    } else {
        console.log(`[${new Date(now).toLocaleTimeString()}] TrafficShare-Task: No location data received.`);
    }
});


// --- TrafficPage Component ---
export default function TrafficPage() {
    // State for points, lastPointTime, and loading (managed directly)
    const [points, setPoints] = useState(0);
    const [lastPointTime, setLastPointTime] = useState(0);
    const [loading, setLoading] = useState(true); // Keep loading true initially

    // State for MapView key to force remount and refresh traffic layer
    const [trafficKey, setTrafficKey] = useState(0);
    // State for current foreground location
    const [location, setLocation] = useState(null);
    // State for snapped location (on road) for foreground map marker
    const [snappedLocation, setSnappedLocation] = useState(null);
    // States for displaying traffic and stuck status in foreground UI
    const [trafficStatus, setTrafficStatus] = useState('Unknown');
    const [isOnRoad, setIsOnRoad] = useState(false);
    const [isStuck, setIsStuck] = useState(false);
    // State for displaying cooldown timer
    const [cooldownLeft, setCooldownLeft] = useState(null);

    // Animated value for the banner display
    const bannerAnim = useRef(new Animated.Value(0)).current;
    const [bannerText, setBannerText] = useState('');

    // Get current Firebase user and create Firestore document reference
    const user = auth.currentUser;
    const userDocRef = user ? doc(db, 'users', user.uid) : null;

    // Function to load current points and lastPointTime from Firebase
    const loadCurrentPointsAndLastPointTime = useCallback(async () => {
        if (!userDocRef) {
            setPoints(0);
            setLastPointTime(0);
            // Don't set loading to false here, it's handled after location is obtained
            return;
        }
        try {
            await ensureUserPointsField(userDocRef); // Ensure document structure before reading
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setPoints(data.points ?? 0);
                setLastPointTime(data.lastPointTime ?? 0);
            } else {
                setPoints(0);
                setLastPointTime(0);
            }
        } catch (error) {
            console.error("TrafficShare-Foreground: Error loading points/lastPointTime:", error);
            setPoints(0);
            setLastPointTime(0);
        }
        // Removed finally block that set loading to false
    }, [userDocRef]);


    // Effect to ensure user's points field exists in Firestore on component mount
    useEffect(() => {
        if (userDocRef) {
            ensureUserPointsField(userDocRef).catch(console.error);
        }
        // Load initial points and lastPointTime from Firestore
        loadCurrentPointsAndLastPointTime();
    }, [userDocRef, loadCurrentPointsAndLastPointTime]);

    // --- Foreground Location and Background Task Management ---
    useEffect(() => {
        const requestPermissionsAndStartTracking = async () => {
            console.log('TrafficShare-Foreground: Requesting foreground permissions...');
            const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
            if (foregroundStatus !== 'granted') {
                Alert.alert('Permission Denied', 'Foreground location access is required for map and initial checks.');
                console.error('TrafficShare-Foreground: Foreground permission denied.');
                setLoading(false); // Stop loading if permission denied
                return;
            }
            console.log('TrafficShare-Foreground: Foreground permissions granted.');

            console.log('TrafficShare-Foreground: Requesting background permissions...');
            const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
            if (backgroundStatus !== 'granted') {
                Alert.alert('Permission Denied', 'Background location access is required to award points when the app is closed.');
                console.error('TrafficShare-Foreground: Background permission denied.');
                setLoading(false); // Stop loading if permission denied
                return;
            }
            console.log('TrafficShare-Foreground: Background permissions granted.');

            // --- Get initial current location once ---
            try {
                const initialLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
                setLocation(initialLocation.coords);
                console.log(`[${new Date().toLocaleTimeString()}] TrafficShare-Foreground: Initial Location: ${initialLocation.coords.latitude.toFixed(5)}, ${initialLocation.coords.longitude.toFixed(5)}`);
                setLoading(false); // Set loading to false once initial location is obtained
            } catch (error) {
                console.error('TrafficShare-Foreground: Error getting initial location:', error);
                Alert.alert('Location Error', 'Could not get your current location. Please ensure GPS is enabled.');
                setLoading(false); // Set loading to false even if initial location fails
                return;
            }


            // Start foreground location watch for map display and immediate UI updates
            const foregroundSubscriber = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.Highest, distanceInterval: 10, timeInterval: 10000 },
                (locUpdate) => {
                    setLocation(locUpdate.coords);
                    console.log(`[${new Date().toLocaleTimeString()}] TrafficShare-Foreground: Current Location: ${locUpdate.coords.latitude.toFixed(5)}, ${locUpdate.coords.longitude.toFixed(5)}`);
                }
            );

            // --- START: MODIFIED LOGIC FOR FORCING BACKGROUND TASK RESTART ---
            const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
            if (isTaskRegistered) {
                console.log('TrafficShare-Foreground: Background task already registered. Stopping and restarting...');
                try {
                    await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
                    console.log('TrafficShare-Foreground: Background task successfully stopped.');
                } catch (e) {
                    console.error('TrafficShare-Foreground: Error stopping background task:', e);
                }
            } else {
                console.log('TrafficShare-Foreground: Background task not registered.');
            }

            console.log('TrafficShare-Foreground: Attempting to start background location updates...');
            try {
                await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
                    accuracy: Location.Accuracy.Highest, // Aggressive for testing
                    distanceInterval: 0, // Aggressive for testing
                    timeInterval: 5000, // Aggressive for testing (every 5 seconds)
                    deferredUpdatesInterval: 5000, // Aggressive for testing (defer for 5 seconds)
                    // Foreground service configuration for persistent notification
                    foregroundService: {
                        notificationTitle: 'TrafficShare',
                        notificationBody: 'Tracking your location for traffic points',
                        notificationColor: '#4caf50', // Green color for notification
                        // Optional: notificationChannelId for Android 8.0+
                        // notificationChannelId: 'traffic_rewards_channel',
                    },
                });
                console.log('TrafficShare-Foreground: Background location task started successfully.');
            } catch (e) {
                console.error('TrafficShare-Foreground: Error starting background location task:', e);
            }
            // --- END: MODIFIED LOGIC FOR FORCING BACKGROUND TASK RESTART ---

            // Cleanup function for when the component unmounts
            return () => {
                if (foregroundSubscriber) foregroundSubscriber.remove();
                // For continuous tracking, the background task is usually left running.
                // To stop it for testing:
                // TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK).then(isRegistered => {
                //   if (isRegistered) Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
                // });
            };
        };

        requestPermissionsAndStartTracking();
    }, []); // Empty dependency array means this effect runs once on mount

    // --- Foreground UI Updates from Background Task Results ---
    // This effect periodically reads data stored by the background task in AsyncStorage
    useEffect(() => {
        const updateForegroundUI = async () => {
            try {
                const currentTrafficStatus = await AsyncStorage.getItem('backgroundTrafficStatus');
                const currentIsOnRoad = await AsyncStorage.getItem('backgroundIsOnRoad');
                const currentIsStuck = await AsyncStorage.getItem('backgroundIsStuck');
                const currentSnappedLocation = await AsyncStorage.getItem('backgroundSnappedLocation');
                const currentLastPointTimeAsync = await AsyncStorage.getItem('lastPointTime'); // Read from AsyncStorage

                if (currentTrafficStatus) setTrafficStatus(currentTrafficStatus);
                if (currentIsOnRoad !== null) setIsOnRoad(JSON.parse(currentIsOnRoad));
                if (currentIsStuck !== null) setIsStuck(JSON.parse(currentIsStuck));
                if (currentSnappedLocation) setSnappedLocation(JSON.parse(currentSnappedLocation));
                if (currentLastPointTimeAsync !== null) setLastPointTime(parseInt(currentLastPointTimeAsync));

                // Also fetch latest points from Firestore to ensure UI is up-to-date
                if (userDocRef) {
                    const docSnap = await getDoc(userDocRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setPoints(data.points ?? 0);
                    }
                }
            } catch (error) {
                console.error("TrafficShare-Foreground: Error updating UI from AsyncStorage/Firestore:", error);
            }
        };

        // Update UI immediately on mount and then every 5 seconds
        updateForegroundUI();
        const uiUpdateInterval = setInterval(updateForegroundUI, 5000);

        return () => clearInterval(uiUpdateInterval); // Cleanup interval on unmount
    }, [userDocRef, setPoints, setLastPointTime]); // Dependencies for this effect

    // Cooldown timer for display in the UI
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const remaining = COOLDOWN_INTERVAL_MS - (now - lastPointTime);
            setCooldownLeft(remaining > 0 ? remaining : 0);
        }, 1000); // Update every second
        return () => clearInterval(interval); // Cleanup interval on unmount
    }, [lastPointTime]); // Dependency for this effect

    // Banner display logic (e.g., for point awards, though not directly used for that here)
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
        // Trigger a UI update from AsyncStorage to reflect latest background task results
        // The background task itself handles the throttling of actual API calls
        (async () => {
            try {
                const currentTrafficStatus = await AsyncStorage.getItem('backgroundTrafficStatus');
                const currentIsOnRoad = await AsyncStorage.getItem('backgroundIsOnRoad');
                const currentIsStuck = await AsyncStorage.getItem('backgroundIsStuck');
                const currentSnappedLocation = await AsyncStorage.getItem('backgroundSnappedLocation');
                const currentLastPointTimeAsync = await AsyncStorage.getItem('lastPointTime');

                if (currentTrafficStatus) setTrafficStatus(currentTrafficStatus);
                if (currentIsOnRoad !== null) setIsOnRoad(JSON.parse(currentIsOnRoad));
                if (currentIsStuck !== null) setIsStuck(JSON.parse(currentIsStuck));
                if (currentSnappedLocation) setSnappedLocation(JSON.parse(currentSnappedLocation));
                if (currentLastPointTimeAsync !== null) setLastPointTime(parseInt(currentLastPointTimeAsync));

                // Also fetch latest points from Firestore to ensure UI is up-to-date
                if (userDocRef) {
                    const docSnap = await getDoc(userDocRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setPoints(data.points ?? 0);
                    }
                }
            } catch (error) {
                console.error("TrafficShare-Foreground: Error during manual refresh:", error);
            }
        })();
    }, [userDocRef, setPoints, setLastPointTime]); // Depend on relevant setters

    // Effect for automatic map traffic layer refresh (every minute)
    useEffect(() => {
        const id = setInterval(() => {
            setTrafficKey(prev => prev + 1);
        }, 60000); // Refresh every 60 seconds
        return () => clearInterval(id); // Cleanup interval on unmount
    }, []);

    // Show loading indicator if location or points are not yet loaded
    if (loading || !location) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text>Loading location and points...</Text>
            </View>
        );
    }

    // Main component render
    return (
        <View style={styles.container}>
            {/* Map View */}
            <MapView
                provider={PROVIDER_GOOGLE}
                key={trafficKey} // Key to force remount for traffic layer refresh
                style={styles.map}
                showsTraffic={true} // Enable traffic layer
                region={
                    location
                        ? {
                            latitude: location.latitude,
                            longitude: location.longitude,
                            latitudeDelta: 0.005, // Zoom level
                            longitudeDelta: 0.005, // Zoom level
                        }
                        : undefined
                }
                showsUserLocation={true} // Show blue dot for user's current location
                showsMyLocationButton={true} // Show button to center on user's location
            >
                {/* Marker for snapped location (if available) */}
                {snappedLocation && <Marker coordinate={snappedLocation} pinColor="blue" />}
            </MapView>

            {/* Information Overlay */}
            <View style={styles.info}>
                <Text style={styles.header}>Points: {points}</Text>
                <Text>Traffic: {trafficStatus}</Text>
                <Text>Stuck: {isStuck ? 'Yes' : 'No'}</Text>
                <Text>Cooldown: {cooldownLeft !== null ? Math.ceil(cooldownLeft / 1000) + 's' : '...'}</Text>
                <Text>On Road: {isOnRoad ? 'Yes' : 'No'}</Text>

                {/* Refresh Button */}
                <TouchableOpacity onPress={refreshTrafficLayer} style={styles.refreshButton}>
                    <Text style={styles.refreshButtonText}>🔄 Refresh Traffic</Text>
                </TouchableOpacity>
            </View>

            {/* Animated Banner for notifications */}
            <Animated.View
                style={[
                    styles.banner,
                    {
                        opacity: bannerAnim,
                        transform: [
                            {
                                translateY: bannerAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [-50, 0], // Slide in from top
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

// --- StyleSheet for component styling ---
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
        elevation: 5, // Android shadow
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
        backgroundColor: '#4caf50', // Green background
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
