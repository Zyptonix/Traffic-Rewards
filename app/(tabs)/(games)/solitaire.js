

// File: app/index.js
// This is the main screen for the Solitaire game.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from 'react-native'; // Removed Alert, Added Dimensions
import { Link } from 'expo-router'; // Not strictly needed for single screen, but good for router context

// --- Constants ---
const SUITS = ['H', 'D', 'C', 'S']; // Hearts, Diamonds, Clubs, Spades
const SUIT_SYMBOLS = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };

// --- Helper Functions ---

// Create a standard 52-card deck
const createDeck = () => {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, faceUp: false, id: `${rank}${suit}` });
    }
  }
  return deck;
};

// Shuffle the deck (Fisher-Yates shuffle)
const shuffleDeck = (deck) => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Deal cards for a new game
const dealCards = () => {
  const deck = shuffleDeck(createDeck());
  const tableauPiles = Array(7).fill(null).map(() => []);
  let deckIndex = 0;

  for (let i = 0; i < 7; i++) {
    for (let j = i; j < 7; j++) {
      const card = deck[deckIndex++];
      if (j === i) card.faceUp = true; // Last card in each pile is face up
      tableauPiles[j].push(card);
    }
  }

  const stockPile = deck.slice(deckIndex);
  return {
    tableauPiles,
    foundationPiles: Array(4).fill(null).map(() => []),
    stockPile,
    wastePile: [],
  };
};

// Get card color (Red or Black)
const getCardColor = (suit) => {
  return (suit === 'H' || suit === 'D') ? 'red' : 'black';
};

// Calculate dynamic card sizes based on screen width
const screenWidth = Dimensions.get('window').width;
const baseCardWidth = Math.floor(screenWidth / 8.7); // Slightly adjusted for potentially tighter fit with footer
const cardHeightToWidthRatio = 1.4; 
const cardWidth = baseCardWidth;
const cardHeight = Math.floor(baseCardWidth * cardHeightToWidthRatio);
const pileSlotWidth = cardWidth + 2; // Reduced padding for tighter fit
const pileSlotHeight = cardHeight + 2; // Reduced padding
const tableauCardOverlap = Math.floor(cardHeight * 0.73); // Adjusted overlap

const FOOTER_HEIGHT = 50; // Estimated height of the new footer

export default function SolitaireGameScreen() {
  const [tableauPiles, setTableauPiles] = useState([]);
  const [foundationPiles, setFoundationPiles] = useState([]);
  const [stockPile, setStockPile] = useState([]);
  const [wastePile, setWastePile] = useState([]);
  const [selectedCardInfo, setSelectedCardInfo] = useState(null); 
  const [gameWon, setGameWon] = useState(false);
  const [moves, setMoves] = useState(0); 

  // Initialize game
  const initializeGame = useCallback(() => {
    const {
      tableauPiles: initialTableau,
      foundationPiles: initialFoundation,
      stockPile: initialStock,
      wastePile: initialWaste,
    } = dealCards();
    setTableauPiles(initialTableau);
    setFoundationPiles(initialFoundation);
    setStockPile(initialStock);
    setWastePile(initialWaste);
    setSelectedCardInfo(null);
    setGameWon(false);
    setMoves(0);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  // Check for win condition
  useEffect(() => {
    if (foundationPiles.length === 0) return; 
    const totalFoundationCards = foundationPiles.reduce((sum, pile) => sum + pile.length, 0);
    if (totalFoundationCards === 52) {
      setGameWon(true);
    }
  }, [foundationPiles]);

  // --- Card Movement Logic ---
  const canPlaceOnTableau = (cardToMove, destinationCard) => {
    if (!destinationCard) return false;
    return getCardColor(cardToMove.suit) !== getCardColor(destinationCard.suit) &&
           RANK_VALUES[cardToMove.rank] === RANK_VALUES[destinationCard.rank] - 1;
  };

  const canPlaceOnFoundation = (cardToMove, foundationPile) => {
    if (foundationPile.length === 0) {
      return cardToMove.rank === 'A';
    }
    const topCard = foundationPile[foundationPile.length - 1];
    return cardToMove.suit === topCard.suit &&
           RANK_VALUES[cardToMove.rank] === RANK_VALUES[topCard.rank] + 1;
  };

  // --- Event Handlers ---
  const handleStockPress = () => {
    if (gameWon) return;
    if (stockPile.length > 0) {
      const newStock = [...stockPile];
      const newWaste = [...wastePile];
      const cardToMove = newStock.pop();
      if (cardToMove) {
        cardToMove.faceUp = true;
        newWaste.push(cardToMove);
        setStockPile(newStock);
        setWastePile(newWaste);
        setMoves(m => m + 1);
      }
    } else if (wastePile.length > 0) {
      const newStock = [...wastePile].reverse().map(card => ({ ...card, faceUp: false }));
      setStockPile(newStock);
      setWastePile([]);
      setMoves(m => m + 1);
    }
    setSelectedCardInfo(null);
  };

  const handleWasteCardPress = (card, cardIndex) => {
    if (gameWon || !card.faceUp) return;
    if (cardIndex === wastePile.length - 1) {
         setSelectedCardInfo({ card, from: { type: 'waste', pileIndex: -1, cardIndex } });
    } else {
        setSelectedCardInfo(null);
    }
  };

  const handleTableauCardPress = (pileIndex, cardIndex, card) => {
    if (gameWon || !card.faceUp) return;

    if (selectedCardInfo) {
      const { card: cardToMove, from } = selectedCardInfo;

      if (from.type === 'tableau' && from.pileIndex === pileIndex) {
         if(from.cardIndex === cardIndex) {
            setSelectedCardInfo(null); 
         } else {
            setSelectedCardInfo({ card, from: { type: 'tableau', pileIndex, cardIndex } });
         }
        return;
      }
      
      const destinationPile = tableauPiles[pileIndex];
      const destinationCard = destinationPile[destinationPile.length - 1];

      if (canPlaceOnTableau(cardToMove, destinationCard)) {
        moveCards(cardToMove, from, { type: 'tableau', pileIndex });
      } else {
        setSelectedCardInfo(null);
      }
    } else {
      setSelectedCardInfo({ card, from: { type: 'tableau', pileIndex, cardIndex } });
    }
  };

  const handleEmptyTableauPilePress = (pileIndex) => {
    if (gameWon || !selectedCardInfo) return;

    const { card: cardToMove, from } = selectedCardInfo;
    if (cardToMove.rank === 'K') {
      moveCards(cardToMove, from, { type: 'tableau', pileIndex });
    } else {
        setSelectedCardInfo(null);
    }
  };

  const handleFoundationPilePress = (pileIndex) => {
    if (gameWon || !selectedCardInfo) return;
    const { card: cardToMove, from } = selectedCardInfo;
    
    if (from.type === 'tableau' && from.cardIndex !== tableauPiles[from.pileIndex].length -1) {
        setSelectedCardInfo(null); 
        return;
    }
     if (from.type === 'waste' && from.cardIndex !== wastePile.length -1) {
        setSelectedCardInfo(null); 
        return;
    }

    const foundationPile = foundationPiles[pileIndex];
    if (canPlaceOnFoundation(cardToMove, foundationPile)) {
      moveCards(cardToMove, from, { type: 'foundation', pileIndex });
    } else {
        setSelectedCardInfo(null);
    }
  };

  // Generic move function
  const moveCards = (cardToMove, from, to) => {
    let cardsToActuallyMove = [];
    const newTableauPiles = tableauPiles.map(p => [...p]);
    const newFoundationPiles = foundationPiles.map(p => [...p]);
    let newWastePile = [...wastePile];

    if (from.type === 'tableau') {
      const sourcePile = newTableauPiles[from.pileIndex];
      cardsToActuallyMove = sourcePile.splice(from.cardIndex);
      if (sourcePile.length > 0 && !sourcePile[sourcePile.length - 1].faceUp) {
        sourcePile[sourcePile.length - 1].faceUp = true;
      }
    } else if (from.type === 'waste') {
      cardsToActuallyMove = [newWastePile.pop()];
    }

    if (to.type === 'tableau') {
      newTableauPiles[to.pileIndex].push(...cardsToActuallyMove);
    } else if (to.type === 'foundation') {
      newFoundationPiles[to.pileIndex].push(...cardsToActuallyMove);
    }

    setTableauPiles(newTableauPiles);
    setFoundationPiles(newFoundationPiles);
    setWastePile(newWastePile);
    setSelectedCardInfo(null);
    setMoves(m => m + 1);
  };

  // --- Render Functions ---
  const renderCard = (card, onPress, key, style = {}) => {
    const dynamicCardStyle = {
        width: cardWidth,
        height: cardHeight,
    };
    const dynamicRankSize = Math.floor(cardHeight * 0.19); 
    const dynamicSuitSize = Math.floor(cardHeight * 0.17);

    if (!card) {
      return <View key={key} style={[styles.cardSlot, styles.emptyCardSlot, dynamicCardStyle, style]}><Text> </Text></View>;
    }

    if (!card.faceUp) {
      return (
        <TouchableOpacity key={key} onPress={onPress} style={[styles.card, styles.cardFaceDown, dynamicCardStyle, style]}>
          <View style={styles.cardBackPattern} />
        </TouchableOpacity>
      );
    }

    const suitSymbol = SUIT_SYMBOLS[card.suit];
    const cardColorStyle = getCardColor(card.suit) === 'red' ? styles.redCardText : styles.blackCardText;

    return (
      <TouchableOpacity key={key} onPress={onPress} style={[styles.card, styles.cardFaceUp, dynamicCardStyle, style]}>
        <View style={styles.cardContent}>
          <Text style={[styles.cardRank, cardColorStyle, {fontSize: dynamicRankSize, lineHeight: dynamicRankSize * 1.1}]}>{card.rank}</Text>
          <Text style={[styles.cardSuit, cardColorStyle, {fontSize: dynamicSuitSize, lineHeight: dynamicSuitSize * 1.1}]}>{suitSymbol}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topArea}>
          <View style={styles.foundationSection}>
            {foundationPiles.map((pile, index) => (
              <TouchableOpacity key={`foundation-${index}`} onPress={() => handleFoundationPilePress(index)} style={[styles.pileSlot, {width: pileSlotWidth, height: pileSlotHeight}]}>
                {pile.length > 0 ?
                  renderCard(pile[pile.length - 1], () => handleFoundationPilePress(index), `f-${index}-${pile[pile.length-1].id}`) :
                  renderCard(null, () => handleFoundationPilePress(index), `f-empty-${index}`)
                }
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.stockWasteSection}>
            <TouchableOpacity onPress={handleStockPress} style={[styles.pileSlot, {width: pileSlotWidth, height: pileSlotHeight}]}>
              {stockPile.length > 0 ?
                renderCard({ suit: '', rank: '', faceUp: false }, handleStockPress, 'stock-top') : 
                renderCard(null, handleStockPress, 'stock-empty')
              }
              {/* Stock count is now in the footer, so no pileLabel here */}
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => wastePile.length > 0 ? handleWasteCardPress(wastePile[wastePile.length-1], wastePile.length-1) : null} 
              style={[styles.pileSlot, {width: pileSlotWidth, height: pileSlotHeight}]}
            >
              {wastePile.length > 0 ?
                renderCard(wastePile[wastePile.length - 1], () => handleWasteCardPress(wastePile[wastePile.length-1], wastePile.length-1), `w-${wastePile[wastePile.length-1].id}`) :
                renderCard(null, () => {}, 'waste-empty')
              }
               <Text style={styles.pileLabel}>Waste ({wastePile.length})</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tableauArea}>
          {tableauPiles.map((pile, pileIndex) => (
            <View key={`tableau-pile-${pileIndex}`} style={[styles.tableauPile, {minHeight: pileSlotHeight + cardHeight * 0.5}]}>
              {pile.length === 0 && (
                   <TouchableOpacity onPress={() => handleEmptyTableauPilePress(pileIndex)} style={[styles.cardSlot, styles.emptyCardSlot, {width: cardWidth, height: cardHeight, minHeight: cardHeight * 0.6}]}>
                      <Text> </Text>
                   </TouchableOpacity>
              )}
              {pile.map((card, cardIndex) => (
                renderCard(
                  card,
                  () => handleTableauCardPress(pileIndex, cardIndex, card),
                  `t-${pileIndex}-${card.id}`,
                  { marginTop: cardIndex > 0 ? -tableauCardOverlap : 0, zIndex: cardIndex } 
                )
              ))}
            </View>
          ))}
        </View>
        
        {gameWon && (
          <View style={styles.winMessageContainer}>
            <Text style={styles.winMessageText}>Congratulations! You Won!</Text>
            <Text style={styles.winMessageText}>Moves: {moves}</Text>
          </View>
        )}

        <TouchableOpacity onPress={initializeGame} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>New Game (Moves: {moves})</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Footer for selected card and stock count */}
      <View style={styles.footerArea}>
        <Text style={styles.footerSelectedText} numberOfLines={1}>
          {selectedCardInfo ? `Selected: ${selectedCardInfo.card.rank}${SUIT_SYMBOLS[selectedCardInfo.card.suit]}` : ' '}
        </Text>
        <Text style={styles.footerStockText}>
          Stock: {stockPile.length}
        </Text>
      </View>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  outerContainer: { // New outer container
    flex: 1,
    backgroundColor: '#006400', 
  },
  scrollView: { // Style for the ScrollView itself
    flex: 1,
  },
  scrollViewContent: { // Style for the ScrollView's content
    paddingHorizontal: Math.floor(screenWidth * 0.01), 
    paddingVertical: 5,
    paddingBottom: FOOTER_HEIGHT + 10, // Ensure content doesn't hide behind footer
  },
  topArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10, 
    paddingHorizontal: 0, 
  },
  foundationSection: {
    flexDirection: 'row',
    flexShrink: 1, 
  },
  stockWasteSection: {
    flexDirection: 'row',
    flexShrink: 1, 
  },
  pileSlot: { 
    borderRadius: 3, // Even smaller radius
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: Math.floor(screenWidth * 0.004), // Very small margin
  },
  pileLabel: { // Kept for Waste pile
    fontSize: Math.floor(cardWidth * 0.14), 
    color: 'rgba(255,255,255,0.7)',
    position: 'absolute',
    bottom: 0,
    textAlign: 'center',
    width: '100%',
  },
  card: { 
    borderRadius: Math.floor(cardWidth * 0.07), 
    borderWidth: 1,
    borderColor: '#444', // Slightly darker border
    alignItems: 'center',
    justifyContent: 'space-between', 
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 1 }, 
    shadowOpacity: 0.18,
    shadowRadius: 1.5,
    elevation: 2, // Reduced elevation
    padding: Math.floor(cardWidth * 0.035), 
  },
  cardFaceUp: {
    backgroundColor: '#fff', 
  },
  cardFaceDown: {
    backgroundColor: '#4682B4', 
    justifyContent: 'center', 
  },
  cardBackPattern: { 
    width: '80%',
    height: '80%',
    borderRadius: Math.floor(cardWidth * 0.05),
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  cardContent: { 
    alignSelf: 'flex-start',
    paddingLeft: Math.floor(cardWidth * 0.025),
    paddingTop: 0,
  },
  cardRank: {
    fontWeight: 'bold',
  },
  cardSuit: {
  },
  redCardText: {
    color: '#D2042D', 
  },
  blackCardText: {
    color: '#111', // Darker black
  },
  emptyCardSlot: { 
    backgroundColor: 'rgba(0,0,0,0.1)', // Lighter empty slot
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1,
    borderRadius: Math.floor(cardWidth * 0.07), 
  },
  tableauArea: {
    flexDirection: 'row',
    justifyContent: 'space-between', 
    paddingHorizontal: 0, 
    flexWrap: 'nowrap', 
  },
  tableauPile: {
    alignItems: 'center',
    marginHorizontal: Math.floor(screenWidth * 0.003), 
    flexShrink: 1, 
    flexBasis: `${100/7 - 0.8}%`, // Adjusted basis
  },
  resetButton: {
    backgroundColor: '#8B4513', 
    paddingVertical: 12, 
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    // marginBottom is handled by scrollViewContent paddingBottom
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  resetButtonText: {
    color: 'white',
    fontSize: Math.floor(cardWidth * 0.28), 
    fontWeight: 'bold',
  },
  winMessageContainer: {
    padding: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.85)', 
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 20,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  winMessageText: {
    fontSize: Math.floor(cardWidth * 0.35), 
    fontWeight: 'bold',
    color: '#4A3B00', 
    textAlign: 'center',
    marginBottom: 5,
  },
  // --- Footer Styles ---
  footerArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: FOOTER_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.75)', // Darker footer
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  footerSelectedText: {
    color: '#FFF',
    fontSize: Math.floor(cardWidth * 0.32), // Dynamic font size
    fontWeight: '500',
    flexShrink: 1, // Allow text to shrink if too long
  },
  footerStockText: {
    color: '#FFF',
    fontSize: Math.floor(cardWidth * 0.32), // Larger font size for stock
    fontWeight: 'bold',
  },
});

