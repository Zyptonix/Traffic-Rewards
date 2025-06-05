import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    Dimensions,
    Alert,
    Vibration,
} from 'react-native';
import { auth, db } from '../../../lib/firebase';
import { doc, updateDoc, increment, getDoc, setDoc, arrayUnion } from 'firebase/firestore';

// Constants
const BOARD_ROWS = 10;
const BOARD_COLS = 10;
const NUM_MINES = 15;

const CELL_STATE = {
    COVERED: 'covered',
    REVEALED: 'revealed',
    FLAGGED: 'flagged',
};

const GAME_STATUS = {
    PLAYING: 'playing',
    WON: 'won',
    LOST: 'lost',
};

const { width } = Dimensions.get('window');
const CELL_SIZE = Math.floor(width / (BOARD_COLS + 2));

// Create 2D array helper
const create2DArray = (rows, cols, createCell) =>
    Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => createCell())
    );

// Memoized Cell component
const Cell = memo(({ cell, onPress, onLongPress }) => {
    let cellContent = '';
    let cellStyle = [styles.cell];

    if (cell.state === CELL_STATE.REVEALED) {
        cellStyle.push(styles.revealedCell);
        if (cell.isMine) {
            cellContent = '💣';
            cellStyle.push(styles.mineCell);
        } else if (cell.value > 0) {
            cellContent = cell.value;
            cellStyle.push(styles[`number${cell.value}`]);
        }
    } else if (cell.isFlagged) {
        cellContent = '🚩';
        cellStyle.push(styles.flaggedCell);
    }

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            style={cellStyle}
            onPress={onPress}
            onLongPress={onLongPress}
            disabled={cell.state === CELL_STATE.REVEALED}
        >
            <Text style={styles.cellText}>{cellContent}</Text>
        </TouchableOpacity>
    );
});

export default function MinesweeperGame() {
    const [board, setBoard] = useState([]);
    const [gameStatus, setGameStatus] = useState(GAME_STATUS.PLAYING);
    const [revealedCount, setRevealedCount] = useState(0);
    const [flagCount, setFlagCount] = useState(0);
    const [currentPoints, setCurrentPoints] = useState(0);
    const [timer, setTimer] = useState(0);
    const timerRef = useRef(null);
    const [resetDisabled, setResetDisabled] = useState(false);

    // Initialize or reset game board
    const initializeGame = useCallback(() => {
        const newBoard = create2DArray(BOARD_ROWS, BOARD_COLS, () => ({
            value: 0,
            state: CELL_STATE.COVERED,
            isMine: false,
            isFlagged: false,
        }));

        let minesPlaced = 0;
        while (minesPlaced < NUM_MINES) {
            const r = Math.floor(Math.random() * BOARD_ROWS);
            const c = Math.floor(Math.random() * BOARD_COLS);
            if (!newBoard[r][c].isMine) {
                newBoard[r][c].isMine = true;
                newBoard[r][c].value = 'M';
                minesPlaced++;
            }
        }

        // Set numbers for non-mines
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (!newBoard[r][c].isMine) {
                    let mineCount = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = r + dr;
                            const nc = c + dc;
                            if (
                                nr >= 0 &&
                                nr < BOARD_ROWS &&
                                nc >= 0 &&
                                nc < BOARD_COLS &&
                                newBoard[nr][nc].isMine
                            ) {
                                mineCount++;
                            }
                        }
                    }
                    newBoard[r][c].value = mineCount;
                }
            }
        }

        setBoard(newBoard);
        setGameStatus(GAME_STATUS.PLAYING);
        setRevealedCount(0);
        setFlagCount(0);
        setTimer(0);
        startTimer();
    }, []);

    // Timer logic
    const startTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer((time) => time + 1);
        }, 1000);
    };

    const stopTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };

    useEffect(() => {
        initializeGame();

        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) loadCurrentPoints();
            else setCurrentPoints(0);
        });

        return () => {
            stopTimer();
            unsubscribe();
        };
    }, [initializeGame]);

    // Firebase helper: ensure user points exist
    const ensureUserPointsField = useCallback(async (userId) => {
        if (!userId) return;
        const userDocRef = doc(db, 'users', userId);
        try {
            const docSnap = await getDoc(userDocRef);
            if (!docSnap.exists()) {
                await setDoc(userDocRef, { points: 0, pointHistory: [] });
            } else {
                const data = docSnap.data();
                const updates = {};
                let needsUpdate = false;
                if (!('points' in data)) {
                    updates.points = 0;
                    needsUpdate = true;
                }
                if (!('pointHistory' in data)) {
                    updates.pointHistory = [];
                    needsUpdate = true;
                }
                if (needsUpdate) await updateDoc(userDocRef, updates);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    // Load points from Firebase
    const loadCurrentPoints = useCallback(async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) return setCurrentPoints(0);
        const userDocRef = doc(db, 'users', userId);
        try {
            await ensureUserPointsField(userId);
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                setCurrentPoints(docSnap.data().points ?? 0);
            }
        } catch (e) {
            console.error(e);
            setCurrentPoints(0);
        }
    }, [ensureUserPointsField]);

    // Update points in Firebase with reason
    const updateFirebasePoints = useCallback(
        async (amount, reason) => {
            const userId = auth.currentUser?.uid;
            if (!userId) {
                Alert.alert('Authentication Error', 'Please log in to save your points.');
                return;
            }
            const userDocRef = doc(db, 'users', userId);
            try {
                await ensureUserPointsField(userId);
                await updateDoc(userDocRef, {
                    points: increment(amount),
                    pointHistory: arrayUnion({
                        amount,
                        reason,
                        timestamp: new Date().toISOString(),
                    }),
                });
                loadCurrentPoints();
            } catch (e) {
                Alert.alert('Error', `Failed to add points: ${e.message}`);
            }
        },
        [ensureUserPointsField, loadCurrentPoints]
    );

    // Reveal cells recursively
    const revealCell = useCallback(
        (row, col) => {
            if (gameStatus !== GAME_STATUS.PLAYING) return;

            const newBoard = board.map((r) => r.map((c) => ({ ...c })));
            const cell = newBoard[row][col];

            if (cell.state === CELL_STATE.REVEALED || cell.isFlagged) return;

            if (cell.isMine) {
                newBoard[row][col].state = CELL_STATE.REVEALED;
                setBoard(newBoard);
                setGameStatus(GAME_STATUS.LOST);
                stopTimer();
                Vibration.vibrate(400);
                Alert.alert('Game Over!', 'You hit a mine!', [
                    { text: 'Play Again', onPress: () => { initializeGame(); } },
                ]);
                return;
            }

            // Reveal logic
            const revealQueue = [{ r: row, c: col }];
            const visited = create2DArray(BOARD_ROWS, BOARD_COLS, () => false);
            let newlyRevealed = 0;

            while (revealQueue.length > 0) {
                const { r, c } = revealQueue.shift();
                if (visited[r][c]) continue;

                const currentCell = newBoard[r][c];
                if (currentCell.state !== CELL_STATE.COVERED) continue;

                currentCell.state = CELL_STATE.REVEALED;
                visited[r][c] = true;
                newlyRevealed++;

                if (currentCell.value === 0 && !currentCell.isMine) {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = r + dr;
                            const nc = c + dc;
                            if (
                                nr >= 0 &&
                                nr < BOARD_ROWS &&
                                nc >= 0 &&
                                nc < BOARD_COLS &&
                                !visited[nr][nc]
                            ) {
                                revealQueue.push({ r: nr, c: nc });
                            }
                        }
                    }
                }
            }

            setBoard(newBoard);
            setRevealedCount((prev) => prev + newlyRevealed);

            // Check for win
            if (revealedCount + newlyRevealed === BOARD_ROWS * BOARD_COLS - NUM_MINES) {
                setGameStatus(GAME_STATUS.WON);
                stopTimer();
                const pointsEarned = 50; // Points awarded for winning
                setCurrentPoints((p) => p + pointsEarned); // Update local points
                updateFirebasePoints(pointsEarned, 'Won Minesweeper'); // Update Firebase points
                Vibration.vibrate(600); // Vibrate on win
                Alert.alert('You Win!', `Congratulations! You earned ${pointsEarned} points.`, [
                    { text: 'Play Again', onPress: () => initializeGame() },
                ]);
            }
        },
        [board, gameStatus, revealedCount, initializeGame, updateFirebasePoints]
    );

    // Toggle flag on cell
    const toggleFlag = useCallback(
        (row, col) => {
            if (gameStatus !== GAME_STATUS.PLAYING) return;

            const newBoard = board.map((r) => r.map((c) => ({ ...c })));
            const cell = newBoard[row][col];

            if (cell.state === CELL_STATE.REVEALED) return;

            if (cell.isFlagged) {
                cell.isFlagged = false;
                setFlagCount((count) => count - 1);
            } else {
                // Ensure flags don't exceed total mines
                if (flagCount >= NUM_MINES) {
                    Alert.alert(`You can only flag up to ${NUM_MINES} mines.`);
                    return;
                }
                cell.isFlagged = true;
                setFlagCount((count) => count + 1);
            }

            setBoard(newBoard);
        },
        [board, gameStatus, flagCount] // Added flagCount to dependency array
    );

    // Handle press on cell
    const handlePress = useCallback(
        (row, col) => {
            revealCell(row, col);
        },
        [revealCell]
    );

    // Handle long press (flag)
    const handleLongPress = useCallback(
        (row, col) => {
            toggleFlag(row, col);
        },
        [toggleFlag]
    );

    // Reset game handler with cooldown to prevent double taps
    const handleReset = () => {
        if (resetDisabled) return;
        setResetDisabled(true);
        initializeGame();
        setTimeout(() => setResetDisabled(false), 2000); // 2-second cooldown
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Minesweeper 🎯</Text>

            <View style={styles.statusRow}>
                <Text style={styles.statusText}>Mines: {NUM_MINES}</Text>
                <Text style={styles.statusText}>Flags: {flagCount}</Text>
                <Text style={styles.statusText}>Time: {timer}s</Text>
            </View>

            {/* Changed 'board' to 'boardContainer' as per new styles */}
            <View style={styles.boardContainer}>
                {board.map((row, rowIndex) => (
                    <View key={`row-${rowIndex}`} style={styles.row}>
                        {row.map((cell, colIndex) => (
                            <Cell
                                key={`${rowIndex}-${colIndex}`}
                                cell={cell}
                                onPress={() => handlePress(rowIndex, colIndex)}
                                onLongPress={() => handleLongPress(rowIndex, colIndex)}
                            />
                        ))}
                    </View>
                ))}
            </View>

            <TouchableOpacity
                onPress={handleReset}
                disabled={resetDisabled}
                style={[styles.resetButton, resetDisabled && styles.disabledButton]}
            >
                <Text style={styles.resetButtonText}>Reset Game</Text>
            </TouchableOpacity>

            {/* Added pointsText component for displaying points */}
            <Text style={styles.pointsText}>Points: {currentPoints}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0f0f0',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 50, // Give some space from the top for status bar etc.
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 20,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '90%',
        marginBottom: 20, // Adjusted margin
    },
    statusText: {
        fontSize: 18,
        color: '#555',
        textAlign: 'center',
        flex: 1, // Distribute text evenly
    },
    pointsText: { // New style for points display
        fontSize: 16,
        color: '#007bff',
        fontWeight: 'bold',
        marginTop: 20, // Used marginTop instead of marginBottom for spacing below button
    },
    boardContainer: { // Renamed from 'board'
        backgroundColor: '#ccc',
        borderRadius: 8,
        overflow: 'hidden', // Ensures rounded corners apply to children
        borderWidth: 2,
        borderColor: '#999',
    },
    row: {
        flexDirection: 'row',
    },
    cell: {
        width: CELL_SIZE,
        height: CELL_SIZE,
        backgroundColor: '#a0a0a0',
        borderWidth: 1,
        borderColor: '#777',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4, // Slightly rounded corners for cells
    },
    revealedCell: {
        backgroundColor: '#e0e0e0',
        borderColor: '#bbb',
    },
    mineCell: {
        backgroundColor: '#ff6b6b', // Red for mines
    },
    flaggedCell: {
        backgroundColor: '#ffc107', // Orange for flags
    },
    cellText: {
        fontSize: CELL_SIZE * 0.5, // Make text size relative to cell size
        fontWeight: 'bold',
        color: '#333',
    },
    // Colors for numbers based on common Minesweeper themes
    number1: { color: '#0000ff' }, // Blue
    number2: { color: '#008000' }, // Green
    number3: { color: '#ff0000' }, // Red
    number4: { color: '#000080' }, // Dark Blue
    number5: { color: '#800000' }, // Dark Red
    number6: { color: '#008080' }, // Teal
    number7: { color: '#000000' }, // Black
    number8: { color: '#808080' }, // Gray

    resetButton: {
        marginTop: 30,
        backgroundColor: '#4CAF50',
        paddingVertical: 12,
        paddingHorizontal: 25,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8, // For Android shadow
    },
    resetButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    disabledButton: { // New style for disabled button state
        backgroundColor: '#94d3a2', // Lighter green when disabled
    },
});