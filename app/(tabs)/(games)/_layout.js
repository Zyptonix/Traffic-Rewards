import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; // Keep Ionicons as register uses it
import { Text } from 'react-native'; // Import Text for emoji icons

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007aff' }}>
      <Tabs.Screen
        name="home" // Assuming this maps to app/login.js
        options={{
          title: 'Games Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Snakes" // Assuming this maps to app/login.js
        options={{
          title: 'Snakes',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color: color }}>🐍</Text> // Lock emoji for login
          ),
        }}
      />
            <Tabs.Screen
        name="bouncegame" // Assuming this maps to app/login.js
        options={{
          title: 'Bounce',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color: color }}>⬆️</Text> // Lock emoji for login
          ),
        }}
      />     
       <Tabs.Screen
        name="minesweeper" // Assuming this maps to app/login.js
        options={{
          title: 'Minesweeper',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color: color }}>💣</Text> // Lock emoji for login
          ),
        }}
      />     
      <Tabs.Screen
        name="solitaire" // Assuming this maps to app/login.js
        options={{
          title: 'Solitaire',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color: color }}>🃏</Text> // Lock emoji for login
          ),
        }}
      />

    </Tabs>
  );
}
