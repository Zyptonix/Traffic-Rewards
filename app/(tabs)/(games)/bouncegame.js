import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  PanResponder,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native'; // Import useFocusEffect

const { width, height } = Dimensions.get('window');
const BALL_SIZE = 30;
const GRAVITY = 0.4;
const JUMP_VELOCITY = -10; // Reduced bounce height
const PLATFORM_WIDTH = 80;
const PLATFORM_HEIGHT = 10;
const OBSTACLE_SIZE = 25; // Obstacles remain smaller
const SCROLL_SPEED = 2;
const MAX_PLATFORMS = 5;
const BALL_MOVE_SPEED = 5; // Speed at which ball moves horizontally on swipe
const HORIZONTAL_REACH_RANGE = width / 3; // Defines the horizontal range around the center where new platforms can appear
const PLATFORM_SPACING_Y = 120; // Vertical distance between platforms, ensures reachability

// Helper function to get a random X position, biased towards a targetX
// Now, this function will primarily be used with `width / 2` as targetX for new spawns
function getBiasedRandomX(targetX) {
  let newX = targetX - HORIZONTAL_REACH_RANGE / 2 + Math.random() * HORIZONTAL_REACH_RANGE;
  // Clamp the newX to ensure it stays within screen bounds
  newX = Math.max(0, Math.min(width - PLATFORM_WIDTH, newX));
  return newX;
}

export default function BounceGame() {
  // State for rendering
  const [ballX, setBallX] = useState(width / 2 - BALL_SIZE / 2);
  const [ballY, setBallY] = useState(height - 200);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [platforms, setPlatforms] = useState([]);
  const [obstacles, setObstacles] = useState([]);

  // Refs to hold the latest state values for the game loop to avoid stale closures
  const ballXRef = useRef(ballX);
  const ballYRef = useRef(ballY);
  const velocityYRef = useRef(0); // Initial velocity
  const platformsRef = useRef(platforms);
  const obstaclesRef = useRef(obstacles);
  const scoreRef = useRef(score);
  const gameOverRef = useRef(gameOver);
  const intervalRef = useRef(null); // Ref for the interval ID

  // Ref for horizontal movement direction from swipe
  const horizontalMoveDirectionRef = useRef(0); // -1 for left, 1 for right, 0 for no movement

  // Update refs whenever the corresponding state changes
  useEffect(() => { ballXRef.current = ballX; }, [ballX]);
  useEffect(() => { ballYRef.current = ballY; }, [ballY]);
  useEffect(() => { platformsRef.current = platforms; }, [platforms]);
  useEffect(() => { obstaclesRef.current = obstacles; }, [obstacles]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  // Game initialization on component mount
  useEffect(() => {
    resetGame();
  }, []);

  const resetGame = useCallback(() => {
    // Ensure the first platform is directly under the ball's starting position
    const initialPlatforms = [
      { x: width / 2 - PLATFORM_WIDTH / 2, y: height * 0.85 - 150 }, // Platform directly under ball
      ...Array.from({ length: MAX_PLATFORMS - 1 }, (_, i) => ({
        x: getBiasedRandomX(width / 2), // Now explicitly bias initial platforms to screen center
        y: height * 0.85 - 150 - (i + 1) * PLATFORM_SPACING_Y, // Distribute others above using consistent spacing
      }))
    ];

    setPlatforms(initialPlatforms);
    // Obstacles now spawn immediately, biased to screen center
    setObstacles([
      { x: getBiasedRandomX(width / 2), y: height * 0.85 / 2 },
      { x: getBiasedRandomX(width / 2), y: -300 },
    ]);
    setBallX(width / 2 - BALL_SIZE / 2);
    setBallY(height * 0.85 - 200); // Adjust initial ball Y to fit within new gameArea height
    velocityYRef.current = 0; // Reset velocity in ref
    setScore(0);
    setGameOver(false);
    horizontalMoveDirectionRef.current = 0; // Reset horizontal movement

  }, []); // No dependencies, as it's a reset function

  const update = useCallback(() => {
    // Use refs for current values in the game loop
    if (gameOverRef.current) { // Check ref to avoid running logic if game is already over
      clearInterval(intervalRef.current); // Ensure interval stops
      return;
    }

    let currentBallY = ballYRef.current;
    let currentVelocityY = velocityYRef.current;
    let currentPlatforms = platformsRef.current;
    let currentObstacles = obstaclesRef.current;
    let currentBallX = ballXRef.current;

    // Apply horizontal movement based on swipe
    if (horizontalMoveDirectionRef.current !== 0) {
      let newBallX = currentBallX + horizontalMoveDirectionRef.current * BALL_MOVE_SPEED;
      newBallX = Math.max(0, Math.min(width - BALL_SIZE, newBallX)); // Keep ball within bounds
      setBallX(newBallX);
    }

    // Apply gravity to velocity
    currentVelocityY += GRAVITY;
    let newY = currentBallY + currentVelocityY;

    // Check for platform collision and bounce
    let bounced = false;
    for (let i = 0; i < currentPlatforms.length; i++) {
      const plat = currentPlatforms[i];
      const onPlatform =
        currentBallY + BALL_SIZE <= plat.y && // Ball was above or at platform
        newY + BALL_SIZE >= plat.y &&       // Ball is now below or at platform
        currentBallX + BALL_SIZE > plat.x && // Ball's right edge is past platform's left edge
        currentBallX < plat.x + PLATFORM_WIDTH; // Ball's left edge is before platform's right edge

      if (onPlatform && currentVelocityY > 0) { // Only bounce if falling
        currentVelocityY = JUMP_VELOCITY;
        bounced = true;
        break; // Only bounce on one platform per frame
      }
    }

    if (bounced) {
      setScore(prevScore => prevScore + 1); // Functional update for score
    }

    // Check collision with obstacle
    if (currentObstacles.length > 0) {
      for (let i = 0; i < currentObstacles.length; i++) {
        const obs = currentObstacles[i];
        const hit =
          newY + BALL_SIZE > obs.y &&
          newY < obs.y + OBSTACLE_SIZE &&
          currentBallX + BALL_SIZE > obs.x &&
          currentBallX < obs.x + OBSTACLE_SIZE;
        if (hit) {
          setGameOver(true);
          Alert.alert('Game Over!', `You hit an obstacle! Score: ${scoreRef.current}`, [{ text: 'Restart', onPress: resetGame }]);
          return; // Stop update loop immediately
        }
      }
    }

    // Scroll everything down
    const scrolledPlatforms = currentPlatforms.map((p) => ({
      ...p,
      y: p.y + SCROLL_SPEED,
    }));
    const scrolledObstacles = currentObstacles.map((o) => ({
      ...o,
      y: o.y + SCROLL_SPEED,
    }));

    // Filter out platforms that have gone off the bottom of the game area
    let activePlatforms = scrolledPlatforms.filter(p => p.y < height * 0.85 + PLATFORM_HEIGHT);

    // Add new platforms if needed to maintain MAX_PLATFORMS
    while (activePlatforms.length < MAX_PLATFORMS) {
      // Find the highest (smallest Y) platform currently active
      const highestActivePlatformY = activePlatforms.reduce((minY, p) => Math.min(minY, p.y), Infinity);
      const newPlatformY = highestActivePlatformY - PLATFORM_SPACING_Y; // Place it above the highest
      activePlatforms.push({ x: getBiasedRandomX(width / 2), y: newPlatformY }); // Bias new platforms to screen center
    }
    // Sort platforms by Y to ensure consistent rendering and finding the highest
    activePlatforms.sort((a, b) => a.y - b.y); // Sort ascending by Y (lowest Y is highest on screen)
    setPlatforms(activePlatforms);

    // Recycle obstacles
    const newObstacles = scrolledObstacles.map((o) =>
      o.y > height * 0.85 ? { x: getBiasedRandomX(width / 2), y: -OBSTACLE_SIZE } : o // Bias new obstacles to screen center
    );
    setObstacles(newObstacles);

    // Update state for rendering
    setBallY(newY);
    // Update velocity ref for next frame's calculation
    velocityYRef.current = currentVelocityY;

    // Game over if fall too far (check against gameArea height)
    if (newY > height * 0.85) {
      setGameOver(true);
      Alert.alert('Game Over!', `You fell! Score: ${scoreRef.current}`, [{ text: 'Restart', onPress: resetGame }]);
    }
  }, []); // Dependencies for useCallback are empty as it uses refs

  // useFocusEffect to control the game loop based on screen focus
  useFocusEffect(
    useCallback(() => {
      // This callback runs when the screen is focused
      // Only start the interval if the game is not currently over
      if (!gameOver) {
        intervalRef.current = setInterval(update, 16);
      }

      // This return function runs when the screen loses focus or component unmounts
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }, [update, gameOver]) // 'gameOver' state is a dependency
  );

  // PanResponder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Reset movement direction on touch start
        horizontalMoveDirectionRef.current = 0;
      },
      onPanResponderMove: (evt, gestureState) => {
        // Determine direction based on dx
        if (gestureState.dx > 10) { // Swiping right
          horizontalMoveDirectionRef.current = 1;
        } else if (gestureState.dx < -10) { // Swiping left
          horizontalMoveDirectionRef.current = -1;
        } else {
          horizontalMoveDirectionRef.current = 0;
        }
      },
      onPanResponderRelease: () => {
        // Stop movement when touch is released
        horizontalMoveDirectionRef.current = 0;
      },
      onPanResponderTerminate: () => {
        // Stop movement if gesture is interrupted
        horizontalMoveDirectionRef.current = 0;
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧱 Bounce Game</Text>
      <Text style={styles.score}>Score: {score}</Text>
      <View
        style={styles.gameArea}
        {...panResponder.panHandlers} // Attach pan handlers to the game area
      >
        <View
          style={[
            styles.ball,
            { left: ballX, top: ballY },
          ]}
        />
        {platforms.map((p, i) => (
          <View
            key={`plat-${i}`}
            style={[
              styles.platform,
              { left: p.x, top: p.y },
            ]}
          />
        ))}
        {obstacles.map((o, i) => (
          <View
            key={`obs-${i}`}
            style={[
              styles.obstacle,
              { left: o.x, top: o.y },
            ]}
          />
        ))}
      </View>

      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.gameOver}>Game Over</Text>
          <TouchableOpacity onPress={resetGame} style={styles.restartButton}>
            <Text style={styles.buttonText}>Restart</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#87CEEB',
    alignItems: 'center',
    paddingTop: 20, // Reduced padding to give more vertical space
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  score: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 10,
  },
  gameArea: {
    width: width,
    height: height * 0.85, // Increased height to fit more content
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  ball: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: 'orange',
    position: 'absolute',
  },
  platform: {
    width: PLATFORM_WIDTH,
    height: PLATFORM_HEIGHT,
    backgroundColor: 'green',
    position: 'absolute',
  },
  obstacle: {
    width: OBSTACLE_SIZE,
    height: OBSTACLE_SIZE,
    backgroundColor: 'red',
    position: 'absolute',
  },
  overlay: {
    position: 'absolute',
    top: '40%', // Adjusted position to be more central with new gameArea height
    left: '20%',
    right: '20%',
    backgroundColor: '#0009',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
  },
  gameOver: {
    color: '#fff',
    fontSize: 24,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  restartButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  buttonText: {
    color: '#333',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
