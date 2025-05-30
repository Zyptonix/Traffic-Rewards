import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007aff' }}>
      <Tabs.Screen
        name="Activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: 'Stores',
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: 'Points',
          tabBarIcon: ({ color, size }) => <Ionicons name="star" size={size} color={color} />,
          href: null
        }}
      />

      <Tabs.Screen
        name="traffic"
        options={{
          title: 'Traffic',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Profilepage"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
          href: null 
        }}
      />
      <Tabs.Screen
        name="redeemedoffers"
        options={{
          title: 'Redeemed',
          tabBarIcon: ({ color, size }) => <Ionicons name="flame-outline" size={size} color={color} />,
        }}
      
      />
            <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-add" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="(games)"
        options={{
          title: 'Games',
          tabBarIcon: ({ color, size }) => <Ionicons name="baseball-outline" size={size} color={color} />,
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      
      />
      
      <Tabs.Screen
          name="store/[id]"
          options={{ href: null }}
      />
      <Tabs.Screen
          name="redeemed/[id]"
          options={{ href: null }}
      />
      <Tabs.Screen
          name="storecategory/[category]"
          options={{ href: null }}
      />
    </Tabs>
    
  );
}
