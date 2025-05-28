// app/index.js
import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useState } from 'react';

export default function Index() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setInitializing(false);
    });
    return unsub;
  }, []);

  if (initializing) return null;

  // If not logged in, go to login
  if (!user) return <Redirect href="/(auth)/login" />;

  // Otherwise, go to your main screen (e.g., /home or dashboard)
  return <Redirect href="/(tabs)/Activity" />;
}
