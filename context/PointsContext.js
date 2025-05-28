import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PointsContext = createContext();

export function PointsProvider({ children }) {
  const [points, setPoints] = useState(0);
  const [lastPointTime, setLastPointTime] = useState(0);
  const [loading, setLoading] = useState(true);

  // Load points and lastPointTime from AsyncStorage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const pointsStr = await AsyncStorage.getItem('points');
        const lastTimeStr = await AsyncStorage.getItem('lastPointTime');

        if (pointsStr !== null) setPoints(parseInt(pointsStr, 10));
        if (lastTimeStr !== null) setLastPointTime(parseInt(lastTimeStr, 10));
      } catch (e) {
        console.warn('Failed to load points data:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Save points to AsyncStorage whenever it changes
  useEffect(() => {
    AsyncStorage.setItem('points', points.toString()).catch(() => {
      console.warn('Failed to save points');
    });
  }, [points]);

  // Save lastPointTime to AsyncStorage whenever it changes
  useEffect(() => {
    AsyncStorage.setItem('lastPointTime', lastPointTime.toString()).catch(() => {
      console.warn('Failed to save lastPointTime');
    });
  }, [lastPointTime]);

  return (
    <PointsContext.Provider
      value={{ points, setPoints, lastPointTime, setLastPointTime, loading }}
    >
      {children}
    </PointsContext.Provider>
  );
}

// Custom hook for easier usage
export function usePoints() {
  const context = useContext(PointsContext);
  if (!context) {
    throw new Error('usePoints must be used within a PointsProvider');
  }
  return context;
}
