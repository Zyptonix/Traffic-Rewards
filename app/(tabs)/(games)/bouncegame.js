import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    Alert,
    PanResponder,
    Animated, // Import Animated
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { doc, updateDoc, increment, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';

const { width, height } = Dimensions.get('window');

const BALL_SIZE = 30;
const GRAVITY = 0.4;
const JUMP_VELOCITY = -12;
const PLATFORM_WIDTH = 80;
const PLATFORM_HEIGHT = 10;
const OBSTACLE_SIZE = 25;
const SCROLL_SPEED = 2;
const MAX_PLATFORMS = 5;
const MAX_OBSTACLES = 3;
const BALL_MOVE_SPEED = 5;
const HORIZONTAL_REACH_RANGE = width / 3;
const PLATFORM_SPACING_Y = 120;
const OBSTACLE_SPAWN_HEIGHT_OFFSET = 100;

// Define GAME_AREA dimensions based on overall screen
const GAME_AREA_WIDTH_PX = width;
const GAME_AREA_HEIGHT_PX = height * 0.85; // Game area takes 85% of screen height
const GAME_AREA_BORDER_WIDTH = 2; // Border width for the game area

// Define PLAYABLE dimensions (inner space) considering the border
const PLAYABLE_WIDTH_PX = GAME_AREA_WIDTH_PX - (2 * GAME_AREA_BORDER_WIDTH);
const PLAYABLE_HEIGHT_PX = GAME_AREA_HEIGHT_PX - (2 * GAME_AREA_BORDER_WIDTH);

/**
 * Generates a random X position for a platform or obstacle, biased towards a target X.
 * Ensures the position stays within the playable width of the game area.
 * @param {number} targetX - The X coordinate to bias the random position towards.
 * @returns {number} The calculated X position.
 */
function getBiasedRandomX(targetX) {
    let newX = targetX - HORIZONTAL_REACH_RANGE / 2 + Math.random() * HORIZONTAL_REACH_RANGE;
    // Clamp newX to ensure it stays within the PLAYABLE_WIDTH_PX (inner game area)
    newX = Math.max(0, Math.min(PLAYABLE_WIDTH_PX - PLATFORM_WIDTH, newX));
    return newX;
}

/**
 * Main Bounce Game component.
 * Manages game state, physics, rendering, and Firebase integration for points.
 */
export default function BounceGame() {
    // Animated.Value objects for ball's position, allowing native animation
    const ballXAnim = useRef(new Animated.Value(PLAYABLE_WIDTH_PX / 2 - BALL_SIZE / 2)).current;
    const ballYAnim = useRef(new Animated.Value(PLAYABLE_HEIGHT_PX * 0.7)).current; // Initial Y for ball

    // State for game logic and UI display
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [platforms, setPlatforms] = useState([]);
    const [obstacles, setObstacles] = useState([]);
    const [currentPoints, setCurrentPoints] = useState(0); // User's total points from Firebase

    // Refs to hold the latest state values for the game loop to avoid stale closures.
    // Animated values are accessed directly via ._value, so no separate refs for them.
    const velocityYRef = useRef(0); // Ball's vertical velocity
    const platformsRef = useRef(platforms); // Current platforms array
    const obstaclesRef = useRef(obstacles); // Current obstacles array
    const scoreRef = useRef(score); // Current game score
    const gameOverRef = useRef(gameOver); // Game over status
    const intervalRef = useRef(null); // ID for the game loop interval
    const lastAwardedScoreRef = useRef(0); // Tracks score for awarding Firebase points
    const horizontalMoveDirectionRef = useRef(0); // -1: left, 0: none, 1: right for ball movement

    // Update refs whenever their corresponding state changes
    useEffect(() => { platformsRef.current = platforms; }, [platforms]);
    useEffect(() => { obstaclesRef.current = obstacles; }, [obstacles]);
    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

    /**
     * Ensures the 'points' and 'pointHistory' fields exist in the user's Firestore document.
     * If not, it initializes them to 0 and an empty array respectively.
     * @param {string} userId - The Firebase User ID.
     */
    const ensureUserPointsField = useCallback(async (userId) => {
        if (!userId) {
            console.warn("ensureUserPointsField: User ID is null. Cannot ensure points field.");
            return;
        }
        const userDocRef = doc(db, 'users', userId);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                let updateNeeded = false;
                const updates = {};
                if (!('points' in data)) {
                    updates.points = 0;
                    updateNeeded = true;
                }
                if (!('pointHistory' in data)) {
                    updates.pointHistory = [];
                    updateNeeded = true;
                }
                if (updateNeeded) {
                    await updateDoc(userDocRef, updates);
                }
            } else {
                // If document doesn't exist, create it with initial fields
                await setDoc(userDocRef, { points: 0, pointHistory: [] });
            }
        } catch (error) {
            console.error("BounceGame: Error ensuring user points field:", error);
        }
    }, []);

    /**
     * Loads the current user's points from Firestore and updates the `currentPoints` state.
     */
    const loadCurrentPoints = useCallback(async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) {
            setCurrentPoints(0);
            return;
        }
        const userDocRef = doc(db, 'users', userId);
        try {
            await ensureUserPointsField(userId); // Ensure fields exist before trying to read
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                setCurrentPoints(docSnap.data().points ?? 0);
            } else {
                setCurrentPoints(0);
            }
        } catch (error) {
            console.error("BounceGame: Error loading current points:", error);
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
        if (!userId) {
            console.warn("BounceGame: User ID not available. Cannot update points.");
            Alert.alert('Authentication Error', 'Please log in to save your points.');
            return;
        }

        const userDocRef = doc(db, 'users', userId);

        try {
            await ensureUserPointsField(userId); // Ensure fields exist before updating
            await updateDoc(userDocRef, {
                points: increment(amount), // Atomically increment points
                pointHistory: arrayUnion({ // Add transaction to history array
                    amount: amount,
                    reason: reason,
                    timestamp: new Date().toISOString(),
                }),
            });
            loadCurrentPoints(); // Refresh displayed points after update
        } catch (error) {
            console.error("BounceGame: Error updating points in Firebase:", error);
            Alert.alert('Error', `Failed to add points: ${error.message}`);
        }
    }, [ensureUserPointsField, loadCurrentPoints]);

    /**
     * The main game update loop. This function is called repeatedly by setInterval.
     * It handles ball movement, collisions, platform/obstacle scrolling, and spawning.
     */
    const update = useCallback(() => {
        // If game is over, stop the loop
        if (gameOverRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            return;
        }

        // Get current values from Animated.Value objects (using ._value for direct access)
        let currentBallX = ballXAnim._value;
        let currentBallY = ballYAnim._value;
        let currentVelocityY = velocityYRef.current;
        let currentPlatforms = platformsRef.current;
        let currentObstacles = obstaclesRef.current;

        // Apply horizontal movement based on swipe direction
        if (horizontalMoveDirectionRef.current !== 0) {
            let newBallX = currentBallX + horizontalMoveDirectionRef.current * BALL_MOVE_SPEED;
            // Clamp ballX to stay within playable area
            newBallX = Math.max(0, Math.min(PLAYABLE_WIDTH_PX - BALL_SIZE, newBallX));
            ballXAnim.setValue(newBallX); // Update Animated.Value for rendering
            currentBallX = newBallX; // Update for current frame's collision checks
        }

        // Apply gravity to vertical velocity
        currentVelocityY += GRAVITY;
        let newY = currentBallY + currentVelocityY;

        // Check for platform collision and bounce
        let bounced = false;
        for (let plat of currentPlatforms) {
            // Check if ball is falling and will land on a platform in this frame
            if (
                currentBallY + BALL_SIZE <= plat.y &&
                newY + BALL_SIZE >= plat.y &&
                currentBallX + BALL_SIZE > plat.x &&
                currentBallX < plat.x + PLATFORM_WIDTH &&
                currentVelocityY > 0
            ) {
                currentVelocityY = JUMP_VELOCITY; // Apply upward jump velocity
                bounced = true;
                break; // Only bounce on one platform per frame
            }
        }

        // If bounced, update score and potentially award Firebase points
        if (bounced) {
            setScore(prev => {
                const newScore = prev + 1;
                // Award 10 points for every 10 score points achieved
                if (newScore > 0 && newScore % 10 === 0 && newScore > lastAwardedScoreRef.current) {
                    updateFirebasePoints(10, `Bounce Game Score: ${newScore}`);
                    lastAwardedScoreRef.current = newScore;
                }
                scoreRef.current = newScore; // Update ref for game over message
                return newScore;
            });
        }

        // Check for obstacle collision
        for (let obs of currentObstacles) {
            if (
                newY + BALL_SIZE > obs.y &&
                newY < obs.y + OBSTACLE_SIZE &&
                currentBallX + BALL_SIZE > obs.x &&
                currentBallX < obs.x + OBSTACLE_SIZE
            ) {
                setGameOver(true); // Set game over state
                clearInterval(intervalRef.current); // Stop the game loop
                intervalRef.current = null;
                Alert.alert('Game Over!', `You hit an obstacle! Score: ${scoreRef.current}`, [
                    { text: 'Restart', onPress: () => resetGame() }, // Offer to restart
                ]);
                return; // Stop further updates
            }
        }

        // Scroll platforms and obstacles down
        let scrolledPlatforms = currentPlatforms.map(p => ({ ...p, y: p.y + SCROLL_SPEED }));
        let scrolledObstacles = currentObstacles.map(o => ({ ...o, y: o.y + SCROLL_SPEED }));

        // Filter out elements that moved off screen (bottom of PLAYABLE_HEIGHT_PX)
        let activePlatforms = scrolledPlatforms.filter(p => p.y < PLAYABLE_HEIGHT_PX);
        let activeObstacles = scrolledObstacles.filter(o => o.y < PLAYABLE_HEIGHT_PX);

        // Spawn new platform at top if needed
        if (activePlatforms.length < MAX_PLATFORMS) {
            // Find highest platform y (smallest Y) to base new platform spawn
            const highestPlatformY = activePlatforms.length > 0 ?
                Math.min(...activePlatforms.map(p => p.y)) : PLAYABLE_HEIGHT_PX; // If no platforms, start from bottom
            const newPlatformY = highestPlatformY - PLATFORM_SPACING_Y;
            activePlatforms.push({ x: getBiasedRandomX(PLAYABLE_WIDTH_PX / 2), y: newPlatformY });
        }
        activePlatforms.sort((a, b) => a.y - b.y); // Sort by Y ascending (highest has smallest Y)

        // Spawn new obstacles independently in the air if needed
        while (activeObstacles.length < MAX_OBSTACLES) {
            activeObstacles.push({
                x: getBiasedRandomX(PLAYABLE_WIDTH_PX / 2),
                // Spawn above screen with a random offset to vary entry points
                y: -(OBSTACLE_SIZE + Math.random() * OBSTACLE_SPAWN_HEIGHT_OFFSET),
            });
        }

        // Update platform and obstacle states
        setPlatforms(activePlatforms);
        platformsRef.current = activePlatforms;
        setObstacles(activeObstacles);
        obstaclesRef.current = activeObstacles;

        // Check if ball falls below the playable area (game over condition)
        if (newY > PLAYABLE_HEIGHT_PX) {
            setGameOver(true);
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            Alert.alert('Game Over!', `You fell! Score: ${scoreRef.current}`, [
                { text: 'Restart', onPress: () => resetGame() },
            ]);
            return;
        }

        ballYAnim.setValue(newY); // Update Animated.Value for rendering
        velocityYRef.current = currentVelocityY; // Update ref for next frame's calculation
    }, [updateFirebasePoints, resetGame, ballXAnim, ballYAnim]); // Add Animated.Value objects to dependencies

    /**
     * Resets the game to its initial state and starts a new game loop.
     */
    const resetGame = useCallback(() => {
        // Clear any existing game interval first to prevent multiple intervals running
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // --- Ball initial position ---
        // Place the ball reasonably high within the playable area.
        const initialBallY = PLAYABLE_HEIGHT_PX * 0.7; // Start ball at 70% down from top of playable area
        ballXAnim.setValue(PLAYABLE_WIDTH_PX / 2 - BALL_SIZE / 2); // Set Animated.Value
        ballYAnim.setValue(initialBallY); // Set Animated.Value
        velocityYRef.current = 0; // Ball starts with no vertical velocity

        // --- Platforms initialization ---
        const initialPlatforms = [];
        // The first platform should be placed just below where the ball starts
        // to ensure the ball is on a platform at the beginning.
        const firstPlatformY = initialBallY + BALL_SIZE + 5; // 5px offset below ball
        initialPlatforms.push({
            x: PLAYABLE_WIDTH_PX / 2 - PLATFORM_WIDTH / 2, // Center the first platform
            y: firstPlatformY,
        });

        // Generate remaining platforms above the first one, maintaining spacing
        for (let i = 1; i < MAX_PLATFORMS; i++) {
            initialPlatforms.push({
                x: getBiasedRandomX(PLAYABLE_WIDTH_PX / 2),
                y: firstPlatformY - i * PLATFORM_SPACING_Y,
            });
        }
        initialPlatforms.sort((a, b) => a.y - b.y); // Sort by Y ascending (highest has smallest Y)

        setPlatforms(initialPlatforms);
        platformsRef.current = initialPlatforms;

        // --- Obstacles initialization (in the air) ---
        const initialObstacles = [];
        for (let i = 0; i < MAX_OBSTACLES; i++) {
            initialObstacles.push({
                x: getBiasedRandomX(PLAYABLE_WIDTH_PX / 2),
                // Distribute initial obstacles vertically above the playable area
                y: -(OBSTACLE_SIZE + Math.random() * OBSTACLE_SPAWN_HEIGHT_OFFSET) - i * (PLAYABLE_HEIGHT_PX / MAX_OBSTACLES),
            });
        }
        setObstacles(initialObstacles);
        obstaclesRef.current = initialObstacles;

        // Reset scores and game status
        setScore(0);
        scoreRef.current = 0;
        setGameOver(false);
        gameOverRef.current = false;
        lastAwardedScoreRef.current = 0;
        horizontalMoveDirectionRef.current = 0;

        loadCurrentPoints(); // Load points when a new game starts

        // Start the game loop immediately after resetting all states
        // The `update` function is a useCallback, so it's stable and can be used here.
        intervalRef.current = setInterval(() => update(), 16);
    }, [loadCurrentPoints, update, ballXAnim, ballYAnim]); // Add Animated.Value objects to dependencies

    /**
     * useFocusEffect hook to manage game loop based on screen focus.
     * Starts the game when the screen is focused and cleans up when it blurs.
     */
    useFocusEffect(
        React.useCallback(() => {
            resetGame(); // Initial game setup and start when screen focuses

            return () => {
                // Cleanup function: clear interval when screen loses focus or component unmounts
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            };
        }, [resetGame]) // `resetGame` is a dependency, ensuring it's the latest version
    );

    /**
     * PanResponder for handling swipe gestures to move the ball horizontally.
     */
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                // Reset horizontal movement direction on touch start
                horizontalMoveDirectionRef.current = 0;
            },
            onPanResponderMove: (evt, gestureState) => {
                // Set direction based on horizontal swipe
                if (gestureState.dx > 10) { // Swiping right
                    horizontalMoveDirectionRef.current = 1;
                } else if (gestureState.dx < -10) { // Swiping left
                    horizontalMoveDirectionRef.current = -1;
                } else {
                    horizontalMoveDirectionRef.current = 0; // No significant horizontal movement
                }
            },
            onPanResponderRelease: () => {
                // Stop horizontal movement when touch is released
                horizontalMoveDirectionRef.current = 0;
            },
            onPanResponderTerminate: () => {
                // Stop horizontal movement if gesture is interrupted
                horizontalMoveDirectionRef.current = 0;
            },
        })
    ).current;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🧱 Bounce Game</Text>
            <Text style={styles.score}>Score: {score}</Text>
            <Text style={styles.pointsText}>Total Points: {currentPoints}</Text>
            <View
                style={styles.gameArea}
                {...panResponder.panHandlers} // Attach pan handlers to the game area
            >
                {/* Ball - now Animated.View for native performance */}
                <Animated.View
                    style={[
                        styles.ball,
                        { left: ballXAnim, top: ballYAnim }, // Use Animated.Value directly here
                    ]}
                />
                {/* Platforms */}
                {platforms.map((p, i) => (
                    <View
                        key={`plat-${i}`}
                        style={[
                            styles.platform,
                            { left: p.x, top: p.y },
                        ]}
                    />
                ))}
                {/* Obstacles */}
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

            {/* Game Over Overlay */}
            {gameOver && (
                <View style={styles.overlay}>
                    <Text style={styles.gameOver}>Game Over</Text>
                    <TouchableOpacity onPress={() => resetGame()} style={styles.restartButton}>
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
        backgroundColor: '#87CEEB', // Sky blue background
        alignItems: 'center',
        paddingTop: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333', // Dark text for contrast
    },
    score: {
        marginTop: 10,
        fontSize: 20,
        fontWeight: 'bold',
        color: '#555',
        marginBottom: 5,
    },
    pointsText: {
        fontSize: 18,
        color: '#007bff', // Blue for points
        fontWeight: 'bold',
        marginBottom: 10,
    },
    gameArea: {
        width: GAME_AREA_WIDTH_PX, // Use defined constant
        height: GAME_AREA_HEIGHT_PX, // Use defined constant
        backgroundColor: '#fff', // White game area background
        borderWidth: GAME_AREA_BORDER_WIDTH, // Use defined constant
        borderColor: '#000', // Black border
        position: 'relative',
        overflow: 'hidden', // Ensures elements don't render outside
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
        borderRadius: OBSTACLE_SIZE / 2, // Make obstacles round
        backgroundColor: 'red',
        position: 'absolute',
    },
    overlay: {
        position: 'absolute',
        top: '40%',
        left: '20%',
        right: '20%',
        backgroundColor: 'rgba(0,0,0,0.7)', // Semi-transparent black
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