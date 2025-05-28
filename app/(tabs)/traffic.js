import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, updateDoc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { usePoints } from '../../context/PointsContext';

const db = getFirestore();
const auth = getAuth();
const GOOGLE_API_KEY = 'AIzaSyBWTvdRIEMQz15-EVi654p5Bpq77wYpDgE'; // <- Replace this

const BUFFER_SIZE = 10;
const STILL_THRESHOLD = 0.1;
const ONE_MINUTE = 1000 * 60;

export default function TrafficPage() {
  const { points, setPoints, lastPointTime, setLastPointTime, loading } = usePoints();

  const [location, setLocation] = useState(null);
  const [snappedLocation, setSnappedLocation] = useState(null);
  const [deltaValue, setDeltaValue] = useState(0);
  const [isStuck, setIsStuck] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(null);
  const [pointHistory, setPointHistory] = useState([]);
  const [trafficStatus, setTrafficStatus] = useState('Unknown');
  const [isOnRoad, setIsOnRoad] = useState(false);
  const [distanceToRoad, setDistanceToRoad] = useState(null);
  const isStuckRef = useRef(isStuck);
  const trafficStatusRef = useRef(trafficStatus);
  const isOnRoadRef = useRef(isOnRoad);

  const motionBuffer = useRef([]);
  const pointsAwardedThisStuck = useRef(false);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const [bannerText, setBannerText] = useState('');

  const user = auth.currentUser;
  const userDocRef = user ? doc(db, 'users', user.uid) : null;

  const prevAccRef = useRef(null);
  function getDestinationFromHeading(lat, lon, heading = 0, distanceMeters = 1000) {
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

  useEffect(() => {
      isStuckRef.current = isStuck;
    }, [isStuck]);

    useEffect(() => {
      trafficStatusRef.current = trafficStatus;
    }, [trafficStatus]);

    useEffect(() => {
      isOnRoadRef.current = isOnRoad;
    }, [isOnRoad]);
  useEffect(() => {
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      let delta = 0;
      if (prevAccRef.current !== null) {
        delta = Math.abs(acceleration - prevAccRef.current);
      }
      prevAccRef.current = acceleration;
      setDeltaValue(delta);

      motionBuffer.current.push(delta);
      if (motionBuffer.current.length > BUFFER_SIZE) motionBuffer.current.shift();

      const avgDelta = motionBuffer.current.reduce((a, b) => a + b, 0) / motionBuffer.current.length;
      if (avgDelta < STILL_THRESHOLD) {
        if (!isStuck) {
          setIsStuck(true);
          pointsAwardedThisStuck.current = false;
        }
      } else {
        if (isStuck) setIsStuck(false);
        pointsAwardedThisStuck.current = false;
      }
    });

    Accelerometer.setUpdateInterval(1000);
    return () => sub.remove();
  }, [isStuck]);

  const showBanner = (text) => {
    setBannerText(text);
    Animated.sequence([
      Animated.timing(bannerAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(bannerAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start();
  };

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('pointHistory');
      if (stored) setPointHistory(JSON.parse(stored));

      if (userDocRef) {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.points) setPoints(data.points);
          if (data.pointHistory) setPointHistory(data.pointHistory);
        } else {
          await setDoc(userDocRef, { points: 0, pointHistory: [] });
          setPoints(0);
          setPointHistory([]);
        }
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);

      const subscriber = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 10, timeInterval: 10000 },
        (locUpdate) => setLocation(locUpdate.coords)
      );

      return () => subscriber.remove();
    })();
  }, []);

  const addToHistory = async (entry) => {
    const newHistory = [entry, ...pointHistory];
    setPointHistory(newHistory);
    await AsyncStorage.setItem('pointHistory', JSON.stringify(newHistory));

    if (userDocRef) {
      await updateDoc(userDocRef, {
        pointHistory: arrayUnion(entry)
      });
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = ONE_MINUTE - (now - lastPointTime);
      setCooldownLeft(remaining > 0 ? remaining : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [lastPointTime]);

  const fetchTrafficStatus = async () => {
    try {
      const { latitude: lat, longitude: lon } = location;
      const safeHeading = (location.heading >= 0 && location.heading <= 360) ? location.heading : 0;
      const { latitude: destLat, longitude: destLon } = getDestinationFromHeading(lat, lon, safeHeading, 1000);
      const destination = `${destLat},${destLon}`;

      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat},${lon}&destinations=${destination}&departure_time=now&key=${GOOGLE_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      const durationInTraffic = data.rows[0].elements[0].duration_in_traffic.value;
      const normalDuration = data.rows[0].elements[0].duration.value;

      const ratio = normalDuration > 0 ? durationInTraffic / normalDuration : 1;
      if (ratio > 1.5) setTrafficStatus('Heavy Traffic (Red Zone)');
      else if (ratio > 1.15) setTrafficStatus('Moderate Traffic (Yellow Zone)');
      else setTrafficStatus('Free Flow (Green Zone)');
    } catch (e) {
      setTrafficStatus('Error fetching traffic');
    }
  };

  const checkIfOnRoad = async () => {
    try {
      const { latitude, longitude } = location;
      const url = `https://roads.googleapis.com/v1/snapToRoads?path=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.snappedPoints && data.snappedPoints.length > 0) {
        const snapped = data.snappedPoints[0].location;
        setSnappedLocation({ latitude: snapped.latitude, longitude: snapped.longitude });

        const distance = getDistanceFromLatLonInMeters(latitude, longitude, snapped.latitude, snapped.longitude);
        setDistanceToRoad(distance);
        setIsOnRoad(distance < 20);
      } else {
        setIsOnRoad(false);
      }
    } catch (e) {
      setIsOnRoad(false);
    }
  };

  useEffect(() => {
    if (!location) return;
    fetchTrafficStatus();
    checkIfOnRoad();

    const intervalId = setInterval(() => {
      fetchTrafficStatus();
      checkIfOnRoad();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [location]);

 useEffect(() => {
  const interval = setInterval(async () => {
    const now = Date.now();
    const cooldownReady = now - lastPointTime >= ONE_MINUTE;
    const inRedZone = trafficStatusRef.current === 'Heavy Traffic (Red Zone)';
const inYellowZone = trafficStatusRef.current === 'Moderate Traffic (Yellow Zone)';
    if (isStuckRef.current && cooldownReady && !pointsAwardedThisStuck.current && isOnRoadRef.current) {

      let pointsToAdd = 0;
      let reason = '';

      if (inRedZone) {
        pointsToAdd = 10;
        reason = 'Stuck in heavy traffic on road';
      } else if (inYellowZone) {
        pointsToAdd = 5;
        reason = 'Stuck in moderate traffic on road';
      }

      if (pointsToAdd > 0) {
        pointsAwardedThisStuck.current = true;

        try {
          const docSnap = await getDoc(userDocRef);
          let latestPoints = points;

          if (docSnap.exists()) {
            const data = docSnap.data();
            latestPoints = data.points ?? points;
          }

          const newPoints = latestPoints + pointsToAdd;
          await updateDoc(userDocRef, { points: newPoints });
          setPoints(newPoints);
          setLastPointTime(Date.now());

          const timestamp = new Date().toLocaleString();
          const historyEntry = { time: timestamp, reason };
          await addToHistory(historyEntry);
          showBanner(`+${pointsToAdd} Points: ${reason}`);
          pointsAwardedThisStuck.current = false;
        } catch (error) {
          console.error('Error updating points:', error);
          pointsAwardedThisStuck.current = false;
        }
      }
    }
  }, 1000);

  return () => clearInterval(interval);
}, [isStuck, points, lastPointTime, trafficStatus, isOnRoad]);

  const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
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

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Loading points...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
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
        <Text>Acceleration delta: {deltaValue.toFixed(4)}</Text>
        <Text>Stuck: {isStuck ? 'Yes' : 'No'}</Text>
        <Text>Cooldown: {cooldownLeft !== null ? Math.ceil(cooldownLeft / 1000) + 's' : '...'}</Text>
        <Text>On Road: {isOnRoad ? 'Yes' : 'No'}</Text>
        <Text>Distance to Road: {distanceToRoad ? distanceToRoad.toFixed(1) + 'm' : 'N/A'}</Text>
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
});
