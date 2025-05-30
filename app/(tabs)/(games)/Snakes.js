import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  SafeAreaView,
  Alert,
  TouchableOpacity,
  ScrollView, // Not strictly needed for SnakeGame, but kept if it was part of a larger layout
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

const CELL_SIZE = 20;
const { width, height } = Dimensions.get('window');
const BOARD_WIDTH = Math.floor(width / CELL_SIZE);
const BOARD_HEIGHT = Math.floor((height * 0.6) / CELL_SIZE); // Adjusted height to fit better
const INITIAL_SNAKE = [{ x: 5, y: 5 }];
const INITIAL_DIRECTION = 'UP';
const SPEED = 150;

function getRandomPosition(currentSnake) {
  let newPos;
  do {
    newPos = {
      x: Math.floor(Math.random() * BOARD_WIDTH),
      y: Math.floor(Math.random() * BOARD_HEIGHT),
    };
  } while (currentSnake.some(segment => segment.x === newPos.x && segment.y === newPos.y));
  return newPos;
}

function isOpposite(newDir, currentDir) {
  return (
    (newDir === 'UP' && currentDir === 'DOWN') ||
    (newDir === 'DOWN' && currentDir === 'UP') ||
    (newDir === 'LEFT' && currentDir === 'RIGHT') ||
    (newDir === 'RIGHT' && currentDir === 'LEFT')
  );
}

export default function SnakeGame() {
  // State for rendering
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [food, setFood] = useState(getRandomPosition(INITIAL_SNAKE));
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);

  // Refs for game logic to avoid stale closures in setInterval
  const snakeRef = useRef(snake);
  const foodRef = useRef(food);
  const directionRef = useRef(direction);
  const scoreRef = useRef(score);
  const gameOverRef = useRef(gameOver);
  const pausedRef = useRef(paused);
  const moveInterval = useRef(null);

  // Update refs whenever their corresponding state changes
  useEffect(() => { snakeRef.current = snake; }, [snake]);
  useEffect(() => { foodRef.current = food; }, [food]);
  useEffect(() => { directionRef.current = direction; }, [direction]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Load high score on component mount
  useEffect(() => {
    loadHighScore();
  }, []);

  // Save high score when score updates
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      AsyncStorage.setItem('highScore', score.toString());
    }
  }, [score, highScore]); // Added highScore to dependency to prevent infinite loop

  // Game logic for moving the snake
  const moveSnake = useCallback(() => {
    // Access current values from refs
    if (gameOverRef.current || pausedRef.current) {
      clearInterval(moveInterval.current);
      return;
    }

    const currentSnake = snakeRef.current;
    const currentDirection = directionRef.current;
    const currentFood = foodRef.current;
    const currentScore = scoreRef.current;

    const head = { ...currentSnake[0] };

    // Move head based on current direction
    if (currentDirection === 'UP') head.y -= 1;
    else if (currentDirection === 'DOWN') head.y += 1;
    else if (currentDirection === 'LEFT') head.x -= 1;
    else if (currentDirection === 'RIGHT') head.x += 1;

    // Check for collisions
    const hitWall =
      head.x < 0 || head.x >= BOARD_WIDTH || head.y < 0 || head.y >= BOARD_HEIGHT;
    const hitSelf = currentSnake.some((seg, idx) => idx !== 0 && seg.x === head.x && seg.y === head.y);

    if (hitWall || hitSelf) {
      setGameOver(true); // Update state to trigger game over UI
      clearInterval(moveInterval.current); // Stop the interval
      Alert.alert('Game Over', `Score: ${currentScore}`, [{ text: 'OK', onPress: resetGame }]);
      return;
    }

    let newSnake = [head, ...currentSnake];
    let newScore = currentScore;
    let newFood = currentFood;

    // Check if food is eaten
    if (head.x === currentFood.x && head.y === currentFood.y) {
      newFood = getRandomPosition(newSnake); // Generate new food, ensuring it's not on the snake
      setFood(newFood);
      newScore += 1;
      setScore(newScore);
    } else {
      newSnake.pop(); // Remove tail if food not eaten
    }

    setSnake(newSnake); // Update snake state for rendering
  }, []); // Dependencies are empty because all dynamic values are accessed via refs

  // useFocusEffect to control the game loop based on screen focus and game state
  useFocusEffect(
    useCallback(() => {
      // This callback runs when the screen is focused or dependencies change
      if (!pausedRef.current && !gameOverRef.current) { // Check refs for latest state
        moveInterval.current = setInterval(moveSnake, SPEED);
      }

      // This return function runs when the screen loses focus or component unmounts
      return () => {
        if (moveInterval.current) {
          clearInterval(moveInterval.current);
        }
      };
    }, [paused, gameOver, moveSnake]) // Dependencies: paused and gameOver states, and the stable moveSnake callback
  );

  const loadHighScore = async () => {
    try {
      const stored = await AsyncStorage.getItem('highScore');
      if (stored !== null) {
        setHighScore(parseInt(stored));
      }
    } catch (error) {
      console.error("Failed to load high score:", error);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gameOverRef.current || pausedRef.current) return; // Prevent movement if game over or paused

        const { dx, dy } = gestureState;
        const currentDirection = directionRef.current; // Get current direction from ref

        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 20 && !isOpposite('RIGHT', currentDirection)) setDirection('RIGHT');
          else if (dx < -20 && !isOpposite('LEFT', currentDirection)) setDirection('LEFT');
        } else {
          if (dy > 20 && !isOpposite('DOWN', currentDirection)) setDirection('DOWN'); // Corrected check for DOWN
          else if (dy < -20 && !isOpposite('UP', currentDirection)) setDirection('UP');
        }
      },
    })
  ).current;

  const resetGame = useCallback(() => {
    setSnake(INITIAL_SNAKE);
    setFood(getRandomPosition(INITIAL_SNAKE)); // Pass initial snake to ensure food doesn't spawn on it
    setDirection(INITIAL_DIRECTION);
    setScore(0);
    setGameOver(false);
    setPaused(false);
    // No need to manually clear interval here, useFocusEffect will handle it
  }, []); // No dependencies, as it's a reset function

  const togglePause = useCallback(() => {
    if (gameOver) return; // Cannot pause if game is over
    setPaused(prev => !prev);
  }, [gameOver]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>🐍 Snake Game</Text>
      <Text style={styles.scoreText}>Score: {score}</Text>
      <Text style={styles.highScoreText}>High Score: {highScore}</Text>

      <View
        style={[
          styles.board,
          { width: BOARD_WIDTH * CELL_SIZE, height: BOARD_HEIGHT * CELL_SIZE },
        ]}
        {...panResponder.panHandlers} // Attach pan handlers to the game area
      >
        {snake.map((segment, index) => (
          <View
            key={index}
            style={[
              styles.snake,
              {
                left: segment.x * CELL_SIZE,
                top: segment.y * CELL_SIZE,
              },
            ]}
          />
        ))}
        <View
          style={[
            styles.food,
            {
              left: food.x * CELL_SIZE,
              top: food.y * CELL_SIZE,
            },
          ]}
        />
      </View>

      <Text style={styles.hint}>Swipe to move</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={togglePause}>
          <Text style={styles.buttonText}>{paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={resetGame}>
          <Text style={styles.buttonText}>Restart</Text>
        </TouchableOpacity>
      </View>

      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.gameOverText}>Game Over!</Text>
          <TouchableOpacity onPress={resetGame} style={styles.restartButtonOverlay}>
            <Text style={styles.buttonText}>Play Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F8FF', // AliceBlue background
    alignItems: 'center',
    paddingTop: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#2E8B57', // SeaGreen
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  scoreText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#4682B4', // SteelBlue
    marginBottom: 5,
  },
  highScoreText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#708090', // SlateGray
    marginBottom: 20,
  },
  board: {
    backgroundColor: '#ADD8E6', // LightBlue
    position: 'relative',
    borderWidth: 4,
    borderColor: '#4682B4', // SteelBlue
    borderRadius: 8,
    overflow: 'hidden', // Ensures snake/food don't render outside
  },
  snake: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: '#32CD32', // LimeGreen
    position: 'absolute',
    borderRadius: 2, // Slightly rounded snake segments
  },
  food: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: '#FF6347', // Tomato
    position: 'absolute',
    borderRadius: CELL_SIZE / 2, // Circular food
  },
  hint: {
    marginTop: 20,
    fontSize: 16,
    color: '#888',
    fontStyle: 'italic',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 30,
    gap: 20,
  },
  button: {
    backgroundColor: '#4CAF50', // Green
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Ensure overlay is on top
  },
  gameOverText: {
    color: '#FFD700', // Gold
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 30,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  restartButtonOverlay: {
    backgroundColor: '#FF4500', // OrangeRed
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
});
