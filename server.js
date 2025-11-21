import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Kvizzing Game Server is Running! 🎮');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', players: Object.keys(players).length });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Game state
let players = {}; // { socketId: { name, score, playerId } }
let buzzerQueue = [];
let buzzerLocked = false;
let currentQuestion = null;

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Player joins
socket.on('join-game', ({ name, playerId }) => {
  // Check if player with this playerId already exists
  const existingPlayer = Object.values(players).find(p => p.playerId === playerId);
  
  if (existingPlayer) {
    // Update the socket ID for reconnecting player
    // First remove old socket entry
    Object.keys(players).forEach(key => {
      if (players[key].playerId === playerId) {
        delete players[key];
      }
    });
    
    // Add with new socket ID
    existingPlayer.socketId = socket.id;
    players[socket.id] = existingPlayer;
    socket.emit('rejoin-success', existingPlayer);
    
    // Broadcast rejoin message
    io.emit('player-rejoined', { 
      name: existingPlayer.name, 
      score: existingPlayer.score 
    });
    
    console.log('Player reconnected:', existingPlayer.name, '- Score:', existingPlayer.score);
  } else {
    // New player
    players[socket.id] = {
      name,
      score: 0,
      playerId: playerId || socket.id,
      socketId: socket.id
    };
    socket.emit('join-success', players[socket.id]);
    console.log('New player joined:', players[socket.id].name);
  }

  // Broadcast updated player list
  const uniquePlayers = Object.values(players).filter((player, index, self) =>
    index === self.findIndex(p => p.playerId === player.playerId)
  );
  io.emit('players-update', uniquePlayers);
});

  // Buzzer press
socket.on('buzz', () => {
  if (players[socket.id]) {
    const player = players[socket.id];
    
    // Check if this player already buzzed
    const alreadyBuzzed = buzzerQueue.find(b => b.playerId === player.playerId);
    
    if (!alreadyBuzzed) {
      // Add to queue
      buzzerQueue.push({
        playerId: player.playerId,
        name: player.name,
        timestamp: Date.now()
      });
      
      // Broadcast to everyone
      io.emit('buzz-received', {
        playerId: player.playerId,
        name: player.name,
        timestamp: Date.now()
      });
      
      console.log('Buzz from:', player.name, '- Position:', buzzerQueue.length);
    }
  }
});

// Disconnect
socket.on('disconnect', () => {
  const player = players[socket.id];
  if (player) {
    console.log('Player disconnected:', player.name);
    
    // Broadcast that player left
    io.emit('player-left', { 
      name: player.name, 
      score: player.score 
    });
    
    // Don't delete - keep for reconnection
    // delete players[socket.id];
  }
  console.log('Client disconnected:', socket.id);
});
  // Quizmaster activates buzzer
socket.on('activate-buzzer', (questionData) => {
  buzzerLocked = false;
  buzzerQueue = [];
  currentQuestion = questionData;
  io.emit('buzzer-active', questionData);
  console.log('Buzzer activated for question:', questionData);
});

  // Quizmaster resets buzzer
  // Quizmaster resets buzzer
socket.on('reset-buzzer', () => {
  buzzerLocked = false;
  buzzerQueue = []; // Clear the queue
  io.emit('buzzer-reset');
  console.log('Buzzer reset');
});

  // Update player score
  socket.on('update-score', ({ playerId, points }) => {
    const player = Object.values(players).find(p => p.playerId === playerId);
    if (player) {
      player.score += points;
      io.emit('players-update', Object.values(players));
      console.log(`Updated ${player.name}'s score by ${points}. New score: ${player.score}`);
    }
  });

  // Get current players
  socket.on('get-players', () => {
    socket.emit('players-update', Object.values(players));
  });

  // Reset game
  socket.on('reset-game', () => {
    players = {};
    buzzerQueue = [];
    buzzerLocked = false;
    currentQuestion = null;
    io.emit('game-reset');
    io.emit('players-update', []);
    console.log('Game reset');
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Keep player data for reconnection
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🎮 Players can connect from phones on the same WiFi`);
});