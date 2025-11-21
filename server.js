import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

// Game state - MUST be declared before routes
let players = {}; // { socketId: { name, score, playerId } }
let buzzerQueue = [];
let buzzerLocked = false;
let currentQuestion = null;

// HTTP Routes with error handling
app.get('/', (req, res) => {
  try {
    console.log('GET / request received');
    const playerCount = Object.keys(players).length;
    console.log('Player count:', playerCount);
    
    res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>🎮 Kvizzing Game Server</h1>
          <p>Server is running!</p>
          <p>Connected players: ${playerCount}</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error in / route:', error);
    res.status(500).send('Internal Server Error: ' + error.message);
  }
});

app.get('/health', (req, res) => {
  try {
    console.log('GET /health request received');
    res.json({ 
      status: 'ok', 
      players: Object.keys(players).length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /health route:', error);
    res.status(500).json({ error: error.message });
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

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

  // Quizmaster activates buzzer
  socket.on('activate-buzzer', (questionData) => {
    buzzerLocked = false;
    buzzerQueue = [];
    currentQuestion = questionData;
    io.emit('buzzer-active', questionData);
    console.log('Buzzer activated for question:', questionData);
  });

  // Quizmaster resets buzzer
  socket.on('reset-buzzer', () => {
    buzzerLocked = false;
    buzzerQueue = [];
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

  // Disconnect - SINGLE handler
  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      console.log('Player disconnected:', player.name);
      
      // Broadcast that player left
      io.emit('player-left', { 
        name: player.name, 
        score: player.score 
      });
      
      // Keep player data for reconnection
      // delete players[socket.id];
    }
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🎮 Players can connect from phones on the same WiFi`);
  console.log(`📡 Server ready to accept connections`);
});

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});