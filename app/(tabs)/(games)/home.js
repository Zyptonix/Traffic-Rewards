import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { Link } from 'expo-router'; // Import Link for navigation

const { width } = Dimensions.get('window');

export default function GameIndexPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🕹️ Arcade Hub 🕹️</Text>
      <ScrollView contentContainerStyle={styles.gameList}>

                {/* Go back to Activity Page Link */}
        <Link href="/../(tabs)/Activity" asChild>
          <TouchableOpacity style={styles.backButton}>
            <Text style={styles.backButtonText}>⬅️ Back to Activity Page</Text>
          </TouchableOpacity>
        </Link>

        {/* Minesweeper Link */}
        <Link href="/minesweeper" asChild>
          <TouchableOpacity style={styles.gameCard}>
            <Text style={styles.gameCardEmoji}>💣</Text>
            <Text style={styles.gameCardTitle}>Minesweeper</Text>
            <Text style={styles.gameCardDescription}>Clear the board without hitting any mines!</Text>
          </TouchableOpacity>
        </Link>

        {/* Bounce Game Link */}
        <Link href="/bouncegame" asChild>
          <TouchableOpacity style={styles.gameCard}>
            <Text style={styles.gameCardEmoji}>⬆️</Text>
            <Text style={styles.gameCardTitle}>Bounce Game</Text>
            <Text style={styles.gameCardDescription}>Keep the ball bouncing on platforms!</Text>
          </TouchableOpacity>
        </Link>

        {/* Snakes Game Link (Placeholder) */}
        <Link href="/Snakes" asChild>
          <TouchableOpacity style={styles.gameCard}>
            <Text style={styles.gameCardEmoji}>🐍</Text>
            <Text style={styles.gameCardTitle}>Snakes</Text>
            <Text style={styles.gameCardDescription}>Grow your snake by eating food!</Text>
          </TouchableOpacity>
        </Link>

        {/* Solitaire Game Link (Placeholder) */}
        <Link href="/solitaire" asChild>
          <TouchableOpacity style={styles.gameCard}>
            <Text style={styles.gameCardEmoji}>🃏</Text>
            <Text style={styles.gameCardTitle}>Solitaire</Text>
            <Text style={styles.gameCardDescription}>Classic card game for one player.</Text>
          </TouchableOpacity>
        </Link>



      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E0F7FA', // Light blue background
    alignItems: 'center',
    paddingTop: 50,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#00796B', // Dark teal color
    marginBottom: 30,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
  gameList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    width: '100%', // Ensure it takes full width for horizontal padding
    alignItems: 'center', // Center cards horizontally
  },
  gameCard: {
    backgroundColor: '#FFFFFF',
    width: width * 0.85, // 85% of screen width
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8, // For Android shadow
    borderWidth: 1,
    borderColor: '#B2EBF2', // Light border color
  },
  gameCardEmoji: {
    fontSize: 50,
    marginBottom: 10,
  },
  gameCardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#263238', // Dark grey text
    marginBottom: 5,
  },
  gameCardDescription: {
    fontSize: 14,
    color: '#607D8B', // Medium grey text
    textAlign: 'center',
    lineHeight: 20,
  },
  backButton: {
    backgroundColor: '#673AB7', // Deep purple, matching the games button on ActivityScreen
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginTop: 20, // Space from the last game card
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
