import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { getAuth } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { Image } from 'react-native';

export default function FriendsPage() {
  const [users, setUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      setCurrentUserId(user.uid);
      loadCurrentUser(user.uid);
      loadUsers(user.uid);
      loadFriends(user.uid);
    }
  }, []);

  const loadCurrentUser = async (uid) => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      setCurrentUser({ id: uid, ...userDoc.data() });
    }
  };

  const loadUsers = async (uid) => {
    try {
      const usersCollection = await getDocs(collection(db, 'users'));
      const userList = [];
      usersCollection.forEach((docSnap) => {
        if (docSnap.id !== uid) {
          userList.push({ id: docSnap.id, ...docSnap.data() });
        }
      });
      setUsers(userList);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async (uid) => {
    try {
      const friendsCollection = await getDocs(collection(db, 'users', uid, 'friends'));
      const friendList = [];
      for (const friendDoc of friendsCollection.docs) {
        const friendData = await getDoc(doc(db, 'users', friendDoc.id));
        if (friendData.exists()) {
          friendList.push({ id: friendDoc.id, ...friendData.data() });
        }
      }
      setFriends(friendList);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

const sendFriendRequest = async (friendId) => {
  // Prevent duplicate requests
  if (friends.some(f => f.id === friendId)) {
    console.log('Already friends');
    return;
  }

  try {
    const userRef = doc(db, 'users', currentUserId, 'friends', friendId);
    await setDoc(userRef, { addedAt: new Date() });
    console.log('Friend request sent to:', friendId);
    loadFriends(currentUserId); // Refresh friend list
  } catch (error) {
    console.error('Failed to send friend request:', error);
  }
};

const renderUser = ({ item }) => {
  const isFriend = friends.some(f => f.id === item.id);

  return (
    <Pressable
      style={[styles.userCard, isFriend && { opacity: 0.5 }]}
      onPress={() => !isFriend && sendFriendRequest(item.id)}
    >
      
      {item.photoURL ? (
        <Image source={{ uri: item.photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.placeholderAvatar]}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>
            {item.name ? item.name[0] : '?'}
          </Text>
        </View>
      )}
      <Text style={styles.username}>{item.name || item.email}</Text>
      <View style={styles.pointsBox}>
        <Text style={styles.addText}>{isFriend ? 'Added' : 'Add Friend'}</Text>
      </View>
    </Pressable>
  );
};




  const renderLeaderboard = () => {
  const leaderboard = [...friends];
  if (currentUser) leaderboard.push(currentUser);
  leaderboard.sort((a, b) => (b.points || 0) - (a.points || 0));

  return leaderboard.map((user, index) => {
    let backgroundColor = '#e0e0e0';
    let medal = '';

    if (index === 0) {
      backgroundColor = '#ffd700'; // Gold
      medal = '🥇';
    } else if (index === 1) {
      backgroundColor = '#c0c0c0'; // Silver
      medal = '🥈';
    } else if (index === 2) {
      backgroundColor = '#cd7f32'; // Bronze
      medal = '🥉';
    }

    return (
      <View key={user.id} style={[styles.leaderboardBox, { backgroundColor }]}>
        <Text style={styles.leaderboardText}>
          {index + 1}. {user.name || user.email} - {user.points || 0} pts
        </Text>
        {medal ? <Text style={styles.medal}>{medal}</Text> : null}
      </View>
    );
  });
};


  if (loading || !currentUser) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4caf50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add New Friends</Text>
      <View style={styles.flatcontainer}>
      <FlatList
        horizontal
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        contentContainerStyle={styles.horizontalList}
        showsHorizontalScrollIndicator={false}
      />
      </View>
      <Text style={styles.subtitle}>Friends Leaderboard</Text>
      {renderLeaderboard()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom:25,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#00796b',
    marginTop: 30,
    marginBottom: 10,
    textAlign: 'center',
  },

  username: {
    fontSize: 16,
    fontWeight: '500',
    color: '#222',
  },
  addButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addText: {
    color: '#fff',
    fontWeight: '600',
  },
  leaderboardEntry: {
    fontSize: 16,
    paddingVertical: 4,
    textAlign: 'left',
    color: '#333',
  },
  leaderboardBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginVertical: 4,
    elevation: 2,
  },
  leaderboardText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  medal: {
    fontSize: 20,
  },

  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom:25,
  },

userCard: {
  width: 200,
  height:200,
  backgroundColor: '#fff',
  borderRadius: 10,
  marginRight: 10,
  paddingVertical: 8,
  paddingHorizontal: 6,
  alignItems: 'center',
  elevation: 2,
},

avatar: {
  width: 60,
  height: 60,
  borderRadius: 30,
  marginBottom: 6,
  resizeMode: 'cover',
  marginTop: 20,
  backgroundColor: '#90a4ae',
  justifyContent: 'center',
  alignItems: 'center',
},

username: {
  fontSize: 12,
  fontWeight: '500',
  color: '#333',
  textAlign: 'center',
  marginBottom: 2,
},

placeholderAvatar: {
  marginTop: 20,
  backgroundColor: '#90a4ae',
  justifyContent: 'center',
  alignItems: 'center',
},

pointsBox: {
  backgroundColor: '#e0f7fa',
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 6,
},

addText: {
  color: '#00796b',
  fontWeight: '500',
  fontSize: 10,
},


});
