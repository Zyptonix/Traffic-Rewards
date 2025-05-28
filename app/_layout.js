// app/_layout.js
import { Tabs } from 'expo-router';
import React from 'react';
import { PointsProvider } from '../context/PointsContext';
import { Slot } from 'expo-router';
export default function RootLayout({ children }) {
  return (
    <PointsProvider>
        {children}
        <Slot />
    </PointsProvider>
  );
}