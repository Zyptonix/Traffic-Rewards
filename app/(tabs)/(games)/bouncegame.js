import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    Alert, // Using native Alert again
    PanResponder,
    Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { doc, updateDoc, increment, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';

const { width, height } = Dimensions.get('window');

const BALL_SIZE = 30;
const GRAVITY = 0.2;
const JUMP_VELOCITY = -8;
const PLATFORM_WIDTH = 100;
const PLATFORM_HEIGHT = 10;
const OBSTACLE_SIZE = 25;
const SCROLL_SPEED = 2;
const MAX_PLATFORMS = 5; // Fixed number of platforms
const MAX_OBSTACLES = 3; // Fixed number of obstacles
const HORIZONTAL_REACH_RANGE = width / 3;
const PLATFORM_SPACING_Y = 100;

// Define GAME_AREA dimensions based on overall screen
const GAME_AREA_WIDTH_PX = width;
const GAME_AREA_HEIGHT_PX = height * 0.85;
const GAME_AREA_BORDER_WIDTH = 2;

// Define PLAYABLE dimensions (inner space) considering the border
const PLAYABLE_WIDTH_PX = GAME_AREA_WIDTH_PX - (2 * GAME_AREA_BORDER_WIDTH);
const PLAYABLE_HEIGHT_PX = GAME_AREA_HEIGHT_PX - (2 * GAME_AREA_BORDER_WIDTH);

// Define the background task name (from TrafficPage)
const LOCATION_TRACKING_TASK = 'trafficshare-location-task';

// Consistent and larger off-screen spawn height for obstacles
const INITIAL_OBSTACLE_OFFSCREEN_HEIGHT = PLAYABLE_HEIGHT_PX * 1.2; // Spawn 1.2x game height above

/**
 * Generates a random X position for a platform or obstacle, biased towards a target X.
 * Ensures the position stays within the playable width of the game area.
 * @param {number} targetX - The X coordinate to bias the random position towards.
 * @returns {number} The calculated X position.
 */
function getBiasedRandomX(targetX) {
    let newX = targetX - HORIZONTAL_REACH_RANGE / 2 + Math.random() * HORIZONTAL_REACH_RANGE;
    newX = Math.max(0, Math.min(PLAYABLE_WIDTH_PX - PLATFORM_WIDTH, newX));
    return newX;
}

/**
 * Main Bounce Game component.
 * Manages game state, physics, rendering, and Firebase integration for points.
 */
export default function BounceGame() {
    const ballXAnim = useRef(new Animated.Value(PLAYABLE_WIDTH_PX / 2 - BALL_SIZE / 2)).current;
    const ballYAnim = useRef(new Animated.Value(PLAYABLE_HEIGHT_PX * 0.7)).current;

    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    // platforms and obstacles state will now hold objects with Animated.Value for yPos and xPos
    const [platforms, setPlatforms] = useState([]);
    const [obstacles, setObstacles] = useState([]);
    const [currentPoints, setCurrentPoints] = useState(0);

    const velocityYRef = useRef(0);
    // platformsRef and obstaclesRef will now hold the actual array objects whose Animated.Values are mutated
    const platformsRef = useRef([]);
    const obstaclesRef = useRef([]);
    const scoreRef = useRef(score);
    const gameOverRef = useRef(gameOver);
    const requestAnimationFrameRef = useRef(null);
    const lastAwardedScoreRef = useRef(0);

    const ballStartX = useRef(0);

    // Update refs whenever their corresponding state changes
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
            await ensureUserPointsField(userId);
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
            Alert.alert('Authentication Error', 'Please log in to save your points.'); // Using Alert
            return;
        }

        const userDocRef = doc(db, 'users', userId);

        try {
            await ensureUserPointsField(userId);
            await updateDoc(userDocRef, {
                points: increment(amount),
                pointHistory: arrayUnion({
                    amount: amount,
                    reason: reason,
                    timestamp: new Date().toISOString(),
                }),
            });
            loadCurrentPoints();
        } catch (error) {
            console.error("BounceGame: Error updating points in Firebase:", error);
            Alert.alert('Error', `Failed to add points: ${error.message}`); // Using Alert
        }
    }, [ensureUserPointsField, loadCurrentPoints]);

    /**
     * The main game update loop. This function is called repeatedly by requestAnimationFrame.
     * It handles ball movement, collisions, platform/obstacle scrolling, and recycling.
     */
    const update = useCallback(() => {
        // Schedule the next frame first to keep the loop running
        if (!gameOverRef.current) {
            requestAnimationFrameRef.current = requestAnimationFrame(update);
        }

        // If game is over, stop the loop
        if (gameOverRef.current) {
            cancelAnimationFrame(requestAnimationFrameRef.current);
            requestAnimationFrameRef.current = null;
            return;
        }

        let currentBallX = ballXAnim._value;
        let currentBallY = ballYAnim._value;
        let currentVelocityY = velocityYRef.current;

        let currentPlatforms = platformsRef.current;
        let currentObstacles = obstaclesRef.current;

        currentVelocityY += GRAVITY;
        let newY = currentBallY + currentVelocityY;

        let bounced = false;
        for (let plat of currentPlatforms) {
            const platY = plat.yPos._value; // Read current Animated.Value
            if (
                currentBallY + BALL_SIZE <= platY &&
                newY + BALL_SIZE >= platY &&
                currentBallX + BALL_SIZE > plat.x &&
                currentBallX < plat.x + PLATFORM_WIDTH &&
                currentVelocityY > 0
            ) {
                currentVelocityY = JUMP_VELOCITY;
                bounced = true;
                break;
            }
        }

        if (bounced) {
            setScore(prev => {
                const newScore = prev + 1;
                // Points are awarded in groups of 10 to reduce Firebase writes
                if (newScore > 0 && newScore % 15 === 0 && newScore > lastAwardedScoreRef.current) {
                    updateFirebasePoints(5, `Bounce Game Score: ${newScore}`);
                    lastAwardedScoreRef.current = newScore;
                }
                scoreRef.current = newScore;
                return newScore;
            });
        }

        for (let obs of currentObstacles) {
            const obsY = obs.yPos._value; // Read current Animated.Value
            if (
                newY + BALL_SIZE > obsY &&
                newY < obsY + OBSTACLE_SIZE &&
                currentBallX + BALL_SIZE > obs.x &&
                currentBallX < obs.x + OBSTACLE_SIZE
            ) {
                setGameOver(true);
                cancelAnimationFrame(requestAnimationFrameRef.current);
                requestAnimationFrameRef.current = null;
                Alert.alert('Game Over!', `You hit an obstacle! Score: ${scoreRef.current}`, [ // Using Alert
                    { text: 'Restart', onPress: () => resetGame() },
                ]);
                return;
            }
        }

        // --- Object Recycling Logic for Platforms ---
        // Find the highest platform *before* any updates for this frame, to maintain consistent spacing
        let highestActivePlatformY = -Infinity;
        if (currentPlatforms.length > 0) {
            highestActivePlatformY = Math.min(...currentPlatforms.map(p => p.yPos._value));
        }

        for (let plat of currentPlatforms) {
            const currentPlatY = plat.yPos._value;
            const newPlatY = currentPlatY + SCROLL_SPEED;
            plat.yPos.setValue(newPlatY); // Update Animated.Value directly for rendering
            plat.y = newPlatY; // Keep numerical y in sync for collision

            if (newPlatY >= PLAYABLE_HEIGHT_PX) {
                // Recycle: Move to top and reset x
                // The new Y position should be consistently above the highest currently active platform
                // to maintain continuous, jumpable vertical spacing.
                const recycledPlatY = highestActivePlatformY - PLATFORM_SPACING_Y;
                plat.yPos.setValue(recycledPlatY); // Update Y
                plat.y = recycledPlatY; // Keep numerical y in sync for collision

                const newX = getBiasedRandomX(PLAYABLE_WIDTH_PX / 2);
                plat.xPos.setValue(newX); // Update X using Animated.Value for rendering
                plat.x = newX; // Keep numerical x in sync for collision
            }
        }

        // --- Object Recycling Logic for Obstacles ---
        for (let obs of currentObstacles) {
            const currentObsY = obs.yPos._value;
            const newObsY = currentObsY + SCROLL_SPEED;
            obs.yPos.setValue(newObsY); // Update Animated.Value directly for rendering
            obs.y = newObsY; // Keep numerical y in sync for collision

            if (newObsY >= PLAYABLE_HEIGHT_PX) {
                // Recycle: Move to top and reset x
                // Spawn above screen, ensuring it's not immediately visible and has varied entry points
                const recycledObsY = -(OBSTACLE_SIZE + INITIAL_OBSTACLE_OFFSCREEN_HEIGHT + Math.random() * (PLAYABLE_HEIGHT_PX / 2));
                obs.yPos.setValue(recycledObsY); // Update Y
                obs.y = recycledObsY; // Keep numerical y in sync for collision

                const newX = getBiasedRandomX(PLAYABLE_WIDTH_PX / 2);
                obs.xPos.setValue(newX); // Update X using Animated.Value for rendering
                obs.x = newX; // Keep numerical x in sync for collision
            }
        }

        if (newY > PLAYABLE_HEIGHT_PX) {
            setGameOver(true);
            cancelAnimationFrame(requestAnimationFrameRef.current);
            requestAnimationFrameRef.current = null;
            Alert.alert('Game Over!', `You fell! Score: ${scoreRef.current}`, [ // Using Alert
                { text: 'Restart', onPress: () => resetGame() },
            ]);
            return;
        }

        ballYAnim.setValue(newY);
        velocityYRef.current = currentVelocityY;
    }, [updateFirebasePoints, resetGame, ballYAnim, ballXAnim]);

    /**
     * Resets the game to its initial state and starts a new game loop.
     */
    const resetGame = useCallback(() => {
        // Clear any existing game animation frame first to prevent multiple loops running
        if (requestAnimationFrameRef.current) {
            cancelAnimationFrame(requestAnimationFrameRef.current);
            requestAnimationFrameRef.current = null;
        }

        // Reset ball position and velocity
        const initialBallY = PLAYABLE_HEIGHT_PX * 0.5; // Start ball mid-screen vertically
        ballXAnim.setValue(PLAYABLE_WIDTH_PX / 2 - BALL_SIZE / 2); // Center ball horizontally
        ballYAnim.setValue(initialBallY);
        velocityYRef.current = 0;

        // --- Initialize Fixed Platforms Array for Object Pooling ---
        const newInitialPlatforms = [];
        // The first platform is directly under the ball for a guaranteed start
        const firstPlatformX = PLAYABLE_WIDTH_PX / 2 - PLATFORM_WIDTH / 2;
        const firstPlatformY = initialBallY + BALL_SIZE + 5;
        newInitialPlatforms.push({
            id: 'plat-0', // Unique ID for React keys
            x: firstPlatformX, // Numerical x for collision
            xPos: new Animated.Value(firstPlatformX), // Animated Value for rendering
            y: firstPlatformY,
            yPos: new Animated.Value(firstPlatformY) // Animated Value for rendering
        });

        // Initialize subsequent platforms above the first one, maintaining jumpable spacing
        for (let i = 1; i < MAX_PLATFORMS; i++) {
            const platY = firstPlatformY - (i * PLATFORM_SPACING_Y); // Distribute upwards
            const platX = getBiasedRandomX(PLAYABLE_WIDTH_PX / 2);
            newInitialPlatforms.push({
                id: `plat-${i}`,
                x: platX, // Numerical x for collision
                xPos: new Animated.Value(platX), // Animated Value for rendering
                y: platY,
                yPos: new Animated.Value(platY)
            });
        }
        // Ensure platforms are sorted by Y for consistent processing, though not strictly required with Animated.Value
        newInitialPlatforms.sort((a, b) => a.yPos._value - b.yPos._value);

        platformsRef.current = newInitialPlatforms; // Update ref directly
        setPlatforms(newInitialPlatforms); // Set state ONCE for initial render

        // --- Initialize Fixed Obstacles Array for Object Pooling ---
        const newInitialObstacles = [];
        for (let i = 0; i < MAX_OBSTACLES; i++) {
            // Obstacles initially appear far above the screen, staggered
            const obsY = -(PLAYABLE_HEIGHT_PX * 0.5) - (i * (PLAYABLE_HEIGHT_PX / MAX_OBSTACLES)) - (Math.random() * OBSTACLE_SIZE);
            const obsX = getBiasedRandomX(PLAYABLE_WIDTH_PX / 2);
            newInitialObstacles.push({
                id: `obs-${Date.now()}-${i}`, // Unique ID
                x: obsX, // Numerical x for collision
                xPos: new Animated.Value(obsX), // Animated Value for rendering
                y: obsY,
                yPos: new Animated.Value(obsY)
            });
        }
        obstaclesRef.current = newInitialObstacles; // Update ref directly
        setObstacles(newInitialObstacles); // Set state ONCE for initial render

        // Reset scores and game status
        setScore(0);
        scoreRef.current = 0;
        setGameOver(false);
        gameOverRef.current = false;
        lastAwardedScoreRef.current = 0;

        loadCurrentPoints();

        // Start the game loop immediately after resetting all states
        requestAnimationFrameRef.current = requestAnimationFrame(update);
    }, [loadCurrentPoints, update, ballXAnim, ballYAnim]);

    /**
     * useFocusEffect hook to manage game loop and background task based on screen focus.
     * Stops the background location task when focused, *does not* restart it when blurred.
     */
    useFocusEffect(
        React.useCallback(() => {
            const stopBackgroundTask = async () => {
                const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
                if (isTaskRegistered) {
                    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
                    if (isTracking) {
                        console.log('BounceGame: Stopping background location task...');
                        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
                    }
                }
            };

            stopBackgroundTask(); // Stop when game screen focuses
            resetGame(); // Initial game setup and start when screen focuses

            return () => {
                if (requestAnimationFrameRef.current) {
                    cancelAnimationFrame(requestAnimationFrameRef.current);
                    requestAnimationFrameRef.current = null;
                }
            };
        }, [resetGame])
    );

    /**
     * PanResponder for handling swipe gestures to move the ball horizontally.
     */
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 5;
            },
            onPanResponderGrant: (evt, gestureState) => {
                ballXAnim.stopAnimation();
                ballStartX.current = ballXAnim._value;
            },
            onPanResponderMove: (evt, gestureState) => {
                let newX = ballStartX.current + gestureState.dx;
                newX = Math.max(0, Math.min(PLAYABLE_WIDTH_PX - BALL_SIZE, newX));
                ballXAnim.setValue(newX);
            },
            onPanResponderRelease: () => {},
            onPanResponderTerminate: () => {},
        })
    ).current;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🧱 Bounce Game</Text>
            <Text style={styles.score}>Score: {score}</Text>
            <Text style={styles.pointsText}>Total Points: {currentPoints}</Text>
            <View
                style={styles.gameArea}
                {...panResponder.panHandlers}
            >
                {/* Ball - Animated.View for native performance */}
                <Animated.View
                    style={[
                        styles.ball,
                        { left: ballXAnim, top: ballYAnim },
                    ]}
                />
                {/* Platforms - NOW Animated.View for native performance for both X and Y */}
                {platforms.map((p) => ( // Using p.id for key
                    <Animated.View
                        key={p.id}
                        style={[
                            styles.platform,
                            { left: p.xPos, top: p.yPos }, // Use Animated.Value for both left and top
                        ]}
                    />
                ))}
                {/* Obstacles - NOW Animated.View for native performance for both X and Y */}
                {obstacles.map((o) => ( // Using o.id for key
                    <Animated.View
                        key={o.id}
                        style={[
                            styles.obstacle,
                            { left: o.xPos, top: o.yPos }, // Use Animated.Value for both left and top
                        ]}
                    />
                ))}
            </View>

            {/* Game Over Overlay (using simple View for overlay as Alert is used) */}
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
        backgroundColor: '#87CEEB',
        alignItems: 'center',
        paddingTop: 20,
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
        marginBottom: 5,
    },
    pointsText: {
        fontSize: 18,
        color: '#007bff',
        fontWeight: 'bold',
        marginBottom: 10,
    },
    gameArea: {
        width: GAME_AREA_WIDTH_PX,
        height: GAME_AREA_HEIGHT_PX,
        backgroundColor: '#fff',
        borderWidth: GAME_AREA_BORDER_WIDTH,
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
        borderRadius: OBSTACLE_SIZE / 2,
        backgroundColor: 'red',
        position: 'absolute',
    },
    overlay: {
        position: 'absolute',
        top: '40%',
        left: '20%',
        right: '20%',
        backgroundColor: 'rgba(0,0,0,0.7)',
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
    },
});