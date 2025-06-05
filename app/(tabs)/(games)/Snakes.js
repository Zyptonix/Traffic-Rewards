import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    PanResponder,
    SafeAreaView,
    TouchableOpacity,
    Alert, // Import Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

// Firebase imports
import { doc, updateDoc, increment, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase'; // Assuming correct path to your firebase config

const CELL_SIZE = 20;
const { width, height } = Dimensions.get('window');
// Board dimensions based on screen size, as per your provided code
const BOARD_WIDTH = Math.floor(width / CELL_SIZE);
const BOARD_HEIGHT = Math.floor((height * 0.5) / CELL_SIZE); // Adjusted height to fit better

const INITIAL_SNAKE = [{ x: 5, y: 5 }];
const INITIAL_DIRECTION = 'UP';
const SPEED = 150; // Snake movement speed in milliseconds

/**
 * Generates a random position for food, ensuring it doesn't overlap with the snake.
 * @param {Array<Object>} currentSnake - The current snake segments.
 * @returns {Object} An object with x and y coordinates for the new food position.
 */
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

/**
 * Checks if the new direction is directly opposite to the current direction,
 * preventing the snake from immediately reversing into itself.
 * @param {string} newDir - The proposed new direction.
 * @param {string} currentDir - The current direction of the snake.
 * @returns {boolean} True if the new direction is opposite, false otherwise.
*/
function isOpposite(newDir, currentDir) {
    return (
        (newDir === 'UP' && currentDir === 'DOWN') ||
        (newDir === 'DOWN' && currentDir === 'UP') ||
        (newDir === 'LEFT' && currentDir === 'RIGHT') ||
        (newDir === 'RIGHT' && currentDir === 'LEFT')
    );
}

/**
 * Main Snake Game component.
 * Manages game state, movement, collisions, scoring, and Firebase integration.
 */
export default function SnakeGame() {
    // State for rendering and game logic
    const [snake, setSnake] = useState(INITIAL_SNAKE);
    const [food, setFood] = useState(getRandomPosition(INITIAL_SNAKE));
    const [direction, setDirection] = useState(INITIAL_DIRECTION);
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [paused, setPaused] = useState(false);
    const [currentPoints, setCurrentPoints] = useState(0); // User's total points from Firebase

    // Refs for game logic to avoid stale closures in setInterval and PanResponder callbacks
    const snakeRef = useRef(snake);
    const foodRef = useRef(food);
    const directionRef = useRef(direction);
    const scoreRef = useRef(score);
    const gameOverRef = useRef(gameOver);
    const pausedRef = useRef(paused);
    const moveInterval = useRef(null); // Ref to store the setInterval ID
    const lastAwardedScoreRef = useRef(0); // Tracks score for awarding Firebase points

    // Update refs whenever their corresponding state changes
    useEffect(() => { snakeRef.current = snake; }, [snake]);
    useEffect(() => { foodRef.current = food; }, [food]);
    useEffect(() => { directionRef.current = direction; }, [direction]);
    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);
    useEffect(() => { pausedRef.current = paused; }, [paused]);

    /**
     * Ensures the 'points' and 'pointHistory' fields exist in the user's Firestore document.
     * If not, it initializes them to 0 and an empty array respectively.
     * @param {string} userId - The Firebase User ID.
     */
    const ensureUserPointsField = useCallback(async (userId) => {
        if (!userId) return;
        const userDocRef = doc(db, 'users', userId);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const updates = {};
                if (!('points' in data)) updates.points = 0;
                if (!('pointHistory' in data)) updates.pointHistory = [];
                if (Object.keys(updates).length) await updateDoc(userDocRef, updates);
            } else {
                // If document doesn't exist, create it with initial fields
                await setDoc(userDocRef, { points: 0, pointHistory: [] });
            }
        } catch (error) {
            console.error("SnakeGame: Error ensuring user points field:", error);
        }
    }, []);

    /**
     * Loads the current user's points from Firestore and updates the `currentPoints` state.
     */
    const loadCurrentPoints = useCallback(async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) return setCurrentPoints(0);
        await ensureUserPointsField(userId); // Ensure fields exist before trying to read
        const userDocRef = doc(db, 'users', userId);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) setCurrentPoints(docSnap.data().points ?? 0);
        } catch (error) {
            console.error("SnakeGame: Error loading current points:", error);
            setCurrentPoints(0);
        }
    }, [ensureUserPointsField]);

    /**
     * Updates the user's points in Firebase and adds an entry to their point history.
     * @param {number} amount - The amount of points to add (can be negative).
     * @param {string} reason - A description for the point transaction.
     */
    const updateFirebasePoints = useCallback(async (amount, reason) => {
        const userId = auth.currentUser?.uid;
        if (!userId) return; // Cannot update points if no user is authenticated
        const userDocRef = doc(db, 'users', userId);
        try {
            await ensureUserPointsField(userId); // Ensure fields exist before updating
            await updateDoc(userDocRef, {
                points: increment(amount), // Atomically increment points
                pointHistory: arrayUnion({ amount, reason, timestamp: new Date().toISOString() }) // Add to history
            });
            loadCurrentPoints(); // Refresh displayed points after update
        } catch (error) {
            console.error("SnakeGame: Error updating Firebase points:", error);
        }
    }, [ensureUserPointsField, loadCurrentPoints]);

    // Effect to load high score and listen for auth state changes
    useEffect(() => {
        loadHighScore(); // Load high score from AsyncStorage on component mount
        // Subscribe to Firebase auth state changes to update current points
        const unsubscribe = auth.onAuthStateChanged(user => user ? loadCurrentPoints() : setCurrentPoints(0));
        return unsubscribe; // Cleanup auth listener on unmount
    }, [loadCurrentPoints]);

    // Effect to update high score in AsyncStorage if current score exceeds it
    useEffect(() => {
        if (score > highScore) {
            setHighScore(score);
            AsyncStorage.setItem('highScore', score.toString());
        }
    }, [score, highScore]);

    /**
     * The core game logic for moving the snake.
     * This function is called repeatedly by the game interval.
     */
    const moveSnake = useCallback(() => {
        // Stop movement if game is over or paused
        if (gameOverRef.current || pausedRef.current) {
            clearInterval(moveInterval.current);
            return;
        }

        const currentSnake = snakeRef.current;
        const currentDirection = directionRef.current;
        const currentFood = foodRef.current;
        const currentScore = scoreRef.current;

        const head = { ...currentSnake[0] }; // Get current head position
        // Update head position based on current direction
        if (currentDirection === 'UP') head.y -= 1;
        else if (currentDirection === 'DOWN') head.y += 1;
        else if (currentDirection === 'LEFT') head.x -= 1;
        else if (currentDirection === 'RIGHT') head.x += 1;

        // Check for collisions (wall or self)
        const hitWall =
            head.x < 0 || head.x >= BOARD_WIDTH || head.y < 0 || head.y >= BOARD_HEIGHT;
        const hitSelf = currentSnake.some((seg, idx) => idx !== 0 && seg.x === head.x && seg.y === head.y);

        if (hitWall || hitSelf) {
            setGameOver(true); // Set game over state
            clearInterval(moveInterval.current); // Stop the interval
            // Show game over alert
            Alert.alert(
                "Game Over!",
                `Your score: ${currentScore}\nHigh Score: ${highScore}\n\nDo you want to play again?`,
                [
                    { text: "No", onPress: () => console.log("Game Over - No Thanks"), style: "cancel" },
                    { text: "Yes", onPress: resetGame }
                ],
                { cancelable: false }
            );
            return;
        }

        let newSnake = [head, ...currentSnake];
        let newScore = currentScore;

        // Check if food is eaten
        if (head.x === currentFood.x && head.y === currentFood.y) {
            setFood(getRandomPosition(newSnake)); // Generate new food, ensuring it's not on the snake
            newScore += 1;
            setScore(newScore);
            // Award Firebase points for every 10 score points
            if (newScore > 0 && newScore % 10 === 0 && newScore > lastAwardedScoreRef.current) {
                updateFirebasePoints(5, `Snake Game Score: ${newScore}`); // Award 5 points
                lastAwardedScoreRef.current = newScore; // Update last awarded score
            }
        } else {
            newSnake.pop(); // Remove tail if food not eaten
        }

        setSnake(newSnake); // Update snake state for rendering
    }, [updateFirebasePoints, resetGame, highScore]); // Dependencies: updateFirebasePoints, resetGame, highScore

    /**
     * useFocusEffect hook to manage the game loop lifecycle based on screen focus.
     * Starts the game interval when the screen is focused and clears it when blurred.
     */
    useFocusEffect(
        useCallback(() => {
            // Start the interval only if the game is not over and not paused
            if (!gameOverRef.current && !pausedRef.current) {
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

    /**
     * Loads the high score from AsyncStorage.
     */
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

    /**
     * PanResponder for handling swipe gestures to change snake direction.
     * Adjusted sensitivity for smoother, more responsive controls.
     */
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (evt, gestureState) => {
                if (gameOverRef.current || pausedRef.current) return;

                const { dx, dy, vx, vy } = gestureState; // Also get velocity
                const currentDirection = directionRef.current;
                const swipeThreshold = 10; // Displacement threshold
                const velocityThreshold = 0.3; // Velocity threshold (you might need to tune this)

                let newPotentialDirection = null;

                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > swipeThreshold) {
                    if (dx > 0 && vx > velocityThreshold) newPotentialDirection = 'RIGHT';
                    else if (dx < 0 && vx < -velocityThreshold) newPotentialDirection = 'LEFT';
                } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > swipeThreshold) {
                    if (dy > 0 && vy > velocityThreshold) newPotentialDirection = 'DOWN';
                    else if (dy < 0 && vy < -velocityThreshold) newPotentialDirection = 'UP';
                }

                // If a new potential direction is detected and it's not opposite to the current direction
                if (newPotentialDirection && !isOpposite(newPotentialDirection, currentDirection)) {
                    // Only update direction if it's different from the current one to prevent unnecessary re-renders
                    if (newPotentialDirection !== currentDirection) {
                        setDirection(newPotentialDirection);
                    }
                }
            },
            onPanResponderRelease: () => {
                // This does reset the gestureState, making the next swipe a 'fresh' one.
            }
        })
    ).current;

    /**
     * Resets the game to its initial state.
     * This function is called when the game ends or the restart button is pressed.
     */
    const resetGame = useCallback(() => {
        clearInterval(moveInterval.current); // Always clear any existing game interval
        moveInterval.current = null; // Ensure the ref is nullified

        // Reset all game states to their initial values
        setSnake(INITIAL_SNAKE);
        setFood(getRandomPosition(INITIAL_SNAKE)); // Pass initial snake to ensure food doesn't spawn on it
        setDirection(INITIAL_DIRECTION);
        setScore(0);
        setGameOver(false); // Explicitly set game over to false
        setPaused(false);   // Explicitly set paused to false
        lastAwardedScoreRef.current = 0; // Reset awarded score tracker
        loadCurrentPoints(); // Reload current points from Firebase

        // Start the game interval after all states have been reset.
        // This ensures the snake starts moving immediately upon reset.
        moveInterval.current = setInterval(moveSnake, SPEED);
    }, [loadCurrentPoints, moveSnake]); // Dependencies: loadCurrentPoints and moveSnake (both stable callbacks)

    /**
     * Toggles the game's paused state.
     * Prevents pausing if the game is already over.
     */
    const togglePause = useCallback(() => {
        if (gameOver) return; // Cannot pause if game is over
        setPaused(prev => {
            if (prev) { // Was paused, now resuming
                // Restart the interval when resuming
                moveInterval.current = setInterval(moveSnake, SPEED);
            } else { // Was playing, now pausing
                // Clear the interval when pausing
                clearInterval(moveInterval.current);
            }
            return !prev; // Toggle the paused state
        });
    }, [gameOver, moveSnake]); // Added moveSnake to dependencies for togglePause

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.title}>🐍 Snake Game</Text>
            <View style={styles.header}>
                <Text style={styles.scoreText}>Score: {score}</Text>
                <Text style={styles.highScoreText}>High Score: {highScore}</Text>
                {/* Display Firebase points if the user is authenticated */}
                {/* Conditionally render based on auth.currentUser being available */}
                {auth.currentUser && <Text style={styles.pointsText}>Points: {currentPoints}</Text>}
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
            <View
                style={[
                    styles.board,
                    // Use directly calculated dimensions for the board style
                    { width: BOARD_WIDTH * CELL_SIZE, height: BOARD_HEIGHT * CELL_SIZE },
                ]}
                {...panResponder.panHandlers} // Attach pan handlers to the game area
            >
                {/* Render snake segments */}
                {snake.map((segment, index) => (
                    <View
                        key={index}
                        style={[
                            styles.snake,
                            { left: segment.x * CELL_SIZE, top: segment.y * CELL_SIZE }
                        ]}
                    />
                ))}
                {/* Render food */}
                <View
                    style={[
                        styles.food,
                        { left: food.x * CELL_SIZE, top: food.y * CELL_SIZE }
                    ]}
                />

                {/* Game Over Overlay - conditionally rendered */}
                {gameOver && (
                    <View style={styles.overlay}>
                        <Text style={styles.gameOverText}>GAME OVER!</Text>
                        {/* The restart button in the overlay is now handled by the Alert */}
                        {/* <TouchableOpacity onPress={resetGame} style={styles.restartButtonOverlay}>
                            <Text style={styles.buttonText}>Play Again</Text>
                        </TouchableOpacity> */}
                    </View>
                )}
            </View>


        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F8FF', // AliceBlue background
        alignItems: 'center',
        paddingTop: 50, // Padding from the top of SafeAreaView
        justifyContent: 'top',
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-around', // Distribute items evenly
        width: '90%', // Occupy 90% of screen width
        marginBottom: 5,
        backgroundColor: '#FFFFFF', // White background for the header
        paddingVertical: 10,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3, // Android shadow
    },
    scoreText: {
        fontSize: 20,
        fontWeight: '600',
        color: '#4682B4', // SteelBlue
    },
    highScoreText: {
        fontSize: 18,
        fontWeight: '500',
        color: '#708090', // SlateGray
    },
    pointsText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#007bff', // Blue for points
    },
    board: {
        // Dimensions are now set dynamically in the component's style prop
        backgroundColor: '#ADD8E6', // LightBlue
        position: 'relative',
        outlineWidth: 2,
        outlineColor: '#4682B4', // SteelBlue
        // outlineRadius: 8,
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
        marginTop: 5,
        fontSize: 16,
        color: '#888',
        fontStyle: 'italic',
    },
    buttonContainer: {
        flexDirection: 'row',
        marginTop: 5,
        marginBottom: 10,
        gap: 20, // Space between buttons
        // Consider adding flexWrap if buttons might overflow on very small screens
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