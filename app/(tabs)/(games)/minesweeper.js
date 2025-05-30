import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Alert } from 'react-native';

// Define the dimensions of the game board
const BOARD_ROWS = 10;
const BOARD_COLS = 10;
const NUM_MINES = 15; // Number of mines on the board

// Cell states
const CELL_STATE_COVERED = 'covered';
const CELL_STATE_REVEALED = 'revealed';
const CELL_STATE_FLAGGED = 'flagged';

// Game status
const GAME_STATUS_PLAYING = 'playing';
const GAME_STATUS_WON = 'won';
const GAME_STATUS_LOST = 'lost';

// Get screen width for responsive cell sizing
const { width } = Dimensions.get('window');
const CELL_SIZE = Math.floor(width / (BOARD_COLS + 2)); // Add some padding

// Helper function to create a 2D array
const create2DArray = (rows, cols, createCell) => {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => createCell())
  );
};

// Main Minesweeper Game Component
export default function MinesweeperGame() {
  // State variables for the game
  const [board, setBoard] = useState([]);
  const [mines, setMines] = useState([]);
  const [gameStatus, setGameStatus] = useState(GAME_STATUS_PLAYING);
  const [revealedCount, setRevealedCount] = useState(0);

  // Function to initialize the game board
  const initializeGame = useCallback(() => {
    const newBoard = create2DArray(BOARD_ROWS, BOARD_COLS, () => ({
      value: 0,
      state: CELL_STATE_COVERED,
      isMine: false,
      isFlagged: false,
    }));

    const newMines = [];
    let minesPlaced = 0;
    while (minesPlaced < NUM_MINES) {
      const row = Math.floor(Math.random() * BOARD_ROWS);
      const col = Math.floor(Math.random() * BOARD_COLS);

      if (!newBoard[row][col].isMine) {
        newBoard[row][col].isMine = true;
        newBoard[row][col].value = 'M';
        newMines.push({ row, col });
        minesPlaced++;
      }
    }

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
    setMines(newMines);
    setGameStatus(GAME_STATUS_PLAYING);
    setRevealedCount(0);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  const revealCell = useCallback(
    (row, col) => {
      const newBoard = board.map((arr) => arr.map((cell) => ({ ...cell })));
      const cell = newBoard[row][col];

      if (
        cell.state === CELL_STATE_REVEALED ||
        cell.isFlagged ||
        gameStatus !== GAME_STATUS_PLAYING
      ) {
        return;
      }

      if (cell.isMine) {
        newBoard[row][col] = { ...cell, state: CELL_STATE_REVEALED };
        setBoard(newBoard);
        setGameStatus(GAME_STATUS_LOST);
        Alert.alert('Game Over!', 'You hit a mine!', [
          { text: 'Play Again', onPress: initializeGame },
        ]);
        return;
      }

      newBoard[row][col] = { ...cell, state: CELL_STATE_REVEALED };
      let currentRevealedCount = revealedCount + 1;

      if (cell.value === 0) {
        const queue = [{ r: row, c: col }];
        const visited = create2DArray(BOARD_ROWS, BOARD_COLS, () => false);

        while (queue.length > 0) {
          const { r, c } = queue.shift();

          if (visited[r][c]) continue;
          visited[r][c] = true;

          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr;
              const nc = c + dc;
              if (
                nr >= 0 &&
                nr < BOARD_ROWS &&
                nc >= 0 &&
                nc < BOARD_COLS
              ) {
                const neighbor = newBoard[nr][nc];
                if (
                  neighbor.state === CELL_STATE_COVERED &&
                  !neighbor.isMine &&
                  !neighbor.isFlagged
                ) {
                  newBoard[nr][nc] = { ...neighbor, state: CELL_STATE_REVEALED };
                  currentRevealedCount++;
                  if (neighbor.value === 0) {
                    queue.push({ r: nr, c: nc });
                  }
                }
              }
            }
          }
        }
      }

      setBoard(newBoard);
      setRevealedCount(currentRevealedCount);

      const totalNonMines = BOARD_ROWS * BOARD_COLS - NUM_MINES;
      if (currentRevealedCount === totalNonMines) {
        setGameStatus(GAME_STATUS_WON);
        Alert.alert('Congratulations!', 'You found all the mines!', [
          { text: 'Play Again', onPress: initializeGame },
        ]);
      }
    },
    [board, revealedCount, gameStatus, initializeGame]
  );

  const toggleFlag = useCallback(
    (row, col) => {
      if (gameStatus !== GAME_STATUS_PLAYING) {
        return;
      }

      const newBoard = board.map((arr) => arr.map((cell) => ({ ...cell })));
      const cell = newBoard[row][col];

      if (cell.state === CELL_STATE_COVERED) {
        newBoard[row][col] = { ...cell, isFlagged: !cell.isFlagged };
        setBoard(newBoard);
      }
    },
    [board, gameStatus]
  );

  const renderCell = (cell, rowIndex, colIndex) => {
    let cellContent = '';
    let cellStyle = [styles.cell];

    if (cell.state === CELL_STATE_REVEALED) {
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
        key={`${rowIndex}-${colIndex}`}
        style={cellStyle}
        onPress={() => revealCell(rowIndex, colIndex)}
        onLongPress={() => toggleFlag(rowIndex, colIndex)}
        disabled={
          gameStatus !== GAME_STATUS_PLAYING &&
          cell.state !== CELL_STATE_REVEALED
        }
      >
        <Text style={styles.cellText}>{cellContent}</Text>
      </TouchableOpacity>
    );
  };

  const renderBoard = () => {
    return board.map((row, rowIndex) => (
      <View key={rowIndex} style={styles.row}>
        {row.map((cell, colIndex) => renderCell(cell, rowIndex, colIndex))}
      </View>
    ));
  };

  const getStatusMessage = () => {
    if (gameStatus === GAME_STATUS_WON) {
      return '🎉 YOU WON! 🎉';
    } else if (gameStatus === GAME_STATUS_LOST) {
      return '💥 GAME OVER! 💥';
    }
    return 'Tap to reveal, long press to flag';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Minesweeper</Text>
      <Text style={styles.statusText}>{getStatusMessage()}</Text>
      <View style={styles.boardContainer}>{renderBoard()}</View>
      <TouchableOpacity style={styles.resetButton} onPress={initializeGame}>
        <Text style={styles.resetButtonText}>Reset Game</Text>
      </TouchableOpacity>
    </View>
  );
}

// Styles for the components
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50, // Give some space from the top for status bar etc.
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  statusText: {
    fontSize: 18,
    color: '#555',
    marginBottom: 20,
    textAlign: 'center',
  },
  boardContainer: {
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
});
