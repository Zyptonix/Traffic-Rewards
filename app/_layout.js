// app/_layout.js
import { PointsProvider } from '../context/PointsContext';
import { Slot } from 'expo-router';
export default function RootLayout({ children }) {
  return (
    <PointsProvider>
        
        <Slot />
    </PointsProvider>
  );
}