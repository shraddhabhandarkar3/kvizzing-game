import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, Users, Trophy, Play, Lock, CheckCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import io from 'socket.io-client';

const KvizzingGame = () => {
  const isPlayerView = window.location.pathname === '/player';
  
  if (isPlayerView) {
    return <PlayerView />;
  }
  
  return <QuizmasterView />;
};

// Player View (for phones)
const PlayerView = () => {
  const [socket, setSocket] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [myScore, setMyScore] = useState(0);
  const [buzzerActive, setBuzzerActive] = useState(false);
  const [buzzedBy, setBuzzedBy] = useState(null);

  useEffect(() => {
    const savedPlayerId = localStorage.getItem('kvizzing-player-id');
    const savedPlayerName = localStorage.getItem('kvizzing-player-name');
    
    if (savedPlayerId) {
      setPlayerId(savedPlayerId);
      setPlayerName(savedPlayerName || '');
    } else {
      const newId = 'player-' + Math.random().toString(36).substr(2, 9);
      setPlayerId(newId);
      localStorage.setItem('kvizzing-player-id', newId);
    }

    const newSocket = io('kvizzing-game-production.up.railway.app');
    setSocket(newSocket);

    newSocket.on('rejoin-success', (data) => {
      setIsJoined(true);
      setPlayerName(data.name);
      setMyScore(data.score);
      localStorage.setItem('kvizzing-player-name', data.name);
    });

    newSocket.on('join-success', (data) => {
      setIsJoined(true);
      setMyScore(data.score);
      localStorage.setItem('kvizzing-player-name', data.name);
    });

    newSocket.on('buzzer-active', () => {
      setBuzzerActive(true);
      setBuzzedBy(null);
    });

    newSocket.on('buzzer-reset', () => {
      setBuzzerActive(false);
      setBuzzedBy(null);
    });

    newSocket.on('buzz-received', (data) => {
  // Only disable buzzer for the person who just buzzed
  if (data.playerId === playerId) {
    setBuzzerActive(false);
    setBuzzedBy('You buzzed!');
  } else {
    setBuzzedBy(data.name + ' buzzed!');
    // Keep buzzer active for others
  }
});

    newSocket.on('players-update', (players) => {
      const me = players.find(p => p.playerId === playerId);
      if (me) {
        setMyScore(me.score);
      }
    });

    newSocket.on('game-reset', () => {
      setMyScore(0);
    });

    return () => newSocket.close();
  }, []);

  const handleJoin = () => {
    if (playerName.trim() && socket) {
      socket.emit('join-game', { name: playerName.trim(), playerId });
    }
  };

  const handleBuzz = () => {
    if (socket && buzzerActive) {
      socket.emit('buzz');
      setBuzzerActive(false);
    }
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
          <h1 className="text-4xl font-bold text-purple-900 text-center mb-8">Join Kvizzing!</h1>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="Enter your name"
            className="w-full px-6 py-4 text-xl border-4 border-purple-300 rounded-xl mb-6 focus:outline-none focus:border-purple-500"
            autoFocus
          />
          <button
            onClick={handleJoin}
            disabled={!playerName.trim()}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-4 px-8 rounded-xl text-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            Join Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">{playerName}</h2>
        <div className="text-6xl font-bold text-yellow-400">{myScore} pts</div>
      </div>

      {buzzedBy && (
        <div className="bg-yellow-400 text-purple-900 px-8 py-4 rounded-2xl text-2xl font-bold mb-8 animate-pulse">
          {buzzedBy === playerName ? '🎉 You buzzed first!' : `${buzzedBy} buzzed!`}
        </div>
      )}

      <button
        onClick={handleBuzz}
        disabled={!buzzerActive}
        className={`w-64 h-64 rounded-full text-4xl font-bold shadow-2xl transition-all transform active:scale-95 ${
          buzzerActive
            ? 'bg-gradient-to-br from-red-500 to-pink-500 text-white animate-pulse cursor-pointer hover:scale-105'
            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
        }`}
      >
        {buzzerActive ? '🔴 BUZZ!' : '⏸️ Wait...'}
      </button>

      <div className="mt-8 text-white text-center">
        <p className="text-lg opacity-75">
          {buzzerActive ? 'Tap the button to buzz!' : 'Wait for the next question...'}
        </p>
      </div>
    </div>
  );
};

// Quizmaster View
const QuizmasterView = () => {
  const [socket, setSocket] = useState(null);
  const [currentTab, setCurrentTab] = useState('qr'); // 'qr', 'round1', 'round2', 'scoreboard', 'winner'
  const [gamePhase, setGamePhase] = useState('setup'); // 'setup', 'round1-active', 'round2-active', 'finished'
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState({
    round1: [],
    round2: []
  });
  const [players, setPlayers] = useState([]);
  const [buzzedPlayer, setBuzzedPlayer] = useState(null);
  const [buzzedPlayers, setBuzzedPlayers] = useState([]); // List of all who buzzed
  const [scoreAwarded, setScoreAwarded] = useState(false);
  const [awardedTo, setAwardedTo] = useState(null);
  const [scoredPlayers, setScoredPlayers] = useState([]); // Track who got points already

  const playerUrl = `http://192.168.4.37:5173/player`;

  // Better Buzzer sound - louder and more distinctive
  const playBuzzerSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Very low, harsh square wave
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
    
    // Loud and short
    gainNode.gain.setValueAtTime(0.6, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    console.log('Buzzer sound error:', error);
  }
};

  useEffect(() => {
    const newSocket = io('kvizzing-game-production.up.railway.app');
    setSocket(newSocket);

    newSocket.on('players-update', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

  newSocket.on('buzz-received', (data) => {
  console.log('🔔 Buzz received from:', data.name, 'at', new Date(data.timestamp).toLocaleTimeString());
  
  // Add to the list of buzzed players
  setBuzzedPlayers(prev => {
    console.log('Previous buzzers:', prev.map(p => p.name));
    
    // Avoid duplicates
    if (prev.find(p => p.playerId === data.playerId)) {
      console.log('⚠️ Duplicate buzz ignored');
      return prev;
    }
    
    const newList = [...prev, data];
    console.log('Updated buzzers list:', newList.map(p => p.name));
    return newList;
  });
  
  playBuzzerSound();
});

newSocket.on('player-rejoined', (data) => {
  console.log(`✅ ${data.name} rejoined with ${data.score} points`);
  // You can show a toast notification here if you want
});

newSocket.on('player-left', (data) => {
  console.log(`❌ ${data.name} left (had ${data.score} points)`);
  // You can show a toast notification here if you want
});

newSocket.emit('get-players');

return () => newSocket.close();
}, []);

  const round1Data = {
    categories: [
      "Mix & Match",
      "Almost Twins",
      "Local@Seattle",
      "Love Actually",
      "Family Frames"
    ],
    questions: {
      "Mix & Match": {
        10: { q: "SILENT", a: "LISTEN" },
        20: { q: "DORMITORY", a: "DIRTY ROOM" },
        30: { q: "ELEVEN PLUS TWO", a: "TWELVE PLUS ONE" },
        40: { q: "THE EYES", a: "THEY SEE" },
        50: { q: "A DECIMAL POINT", a: "I'M A DOT IN PLACE" }
      },
      "Almost Twins": {
        10: { q: "Word 1: A sweet, juicy fruit with yellow or green skin that grows on trees\n\nWord 2: A smooth, round, lustrous gem formed within the shell of an oyster", a: "PEAR & PEARL" },
        20: { q: "Word 1: To perceive sounds through the ear; the faculty of auditory perception\n\nWord 2: A hollow muscular organ that pumps blood; the center of emotions", a: "HEAR & HEART" },
        30: { q: "Word 1: A competition of speed; to move at high velocity\n\nWord 2: Elegance or beauty of form, manner, or movement; a prayer said before a meal", a: "RACE & GRACE" },
        40: { q: "Word 1: A strong feeling of annoyance, displeasure, or hostility\n\nWord 2: The possibility of suffering harm or injury; a threat or risk", a: "ANGER & DANGER" },
        50: { q: "A sound expressing amusement, mirth, or derision; the action of laughing\n\nWord 2: The killing of a large number of people or animals in a cruel or violent way; a massacre", a: "LAUGHTER & SLAUGHTER" }
      },
      "Local@Seattle": {
        10: { q: "This Seattle grunge band's frontman Kurt Cobain became a 90s icon. Name the band.", a: "Nirvana" },
        20: { q: "This 1993 romantic comedy starring Tom Hanks and Meg Ryan made the Space Needle iconic worldwide. Name the movie.", a: "Sleepless in Seattle" },
        30: { q: "I'm a giant sculpture living under a bridge in Fremont, clutching a real Volkswagen Beetle in my left hand. Tourists love taking photos with me. What am I called?", a: "Fremont Troll/Troll under the bridge" },
        40: { q: "This blockbuster teen movie starring Heath Ledger and Julia Stiles, a modern adaptation of Shakespeare's 'The Taming of the Shrew,' was filmed at Stadium High School in nearby Tacoma and various Seattle locations in 1999. Name the film.", a: "10 things I hate about you" },
        50: { q: "The Space Needle's rotating restaurant completes one full rotation in how many minutes? (It was originally called the Eye of the Needle)", a: "45 minutes" }
      },
      "Love Actually": {
        10: { q: "Two parallel love stories set decades apart explore how romance has evolved from the 1960s to modern times, showing that some emotions remain timeless despite changing eras.", 
              cast: "(Saif Ali Khan, Deepika Padukone, Rishi Kapoor) 2009", 
              a: "Love Aaj Kal" },
        20: { q: "A serial dater's life philosophy crumbles when he meets someone who challenges everything he teaches other men about relationships. His own mentor simultaneously navigates a mid-life marital crisis.",
              cast: "(Ryan Gosling, Steve Carell, Emma Stone) 2011",
              a: "Crazy, Stupid, Love" },
        30: { q: "A charming pharmaceutical sales rep and a patient with a degenerative disease enter a volatile relationship complicated by her refusal to be pitied and his inability to commit.",
              cast:"(Jake Gyllenhaal, Anne Hathaway, Oliver Platt) 2010", 
              a: "Love and Other Drugs" },
        40: { q: "A young widow receives guidance from beyond the grave through pre-written messages, leading her across the Atlantic to confront her grief and discover herself, also a famous book.",
              cast: "(Hilary Swank, Gerard Butler) 2007", 
              a: "PS: I love you" },
        50: { q: "When her most private confessions are unexpectedly delivered to five recipients, a teenager must navigate the social chaos while a fake relationship becomes surprisingly real.",
              cast: "(Lana Condor, Noah Centineo, Janel Parrish) 2018", 
              a: "To all the boys I have loved before" }
      },
      "Family Frames": {
        10: { q: "Father and son appeared in this 2005 crime comedy where the father played a relentless police officer chasing two con artists across India, while the son was one half of the criminal duo. The son's real-life wife made a special appearance in an iconic dance number.'", a: "Bunty aur Babli (Abhishek and Amitabh Bachhan)" },
        20: { q: "In this 2011 musical romance about a struggling musician's journey to stardom, a grandson and his legendary grandfather from the Kapoor dynasty both appeared. The grandfather played a classical music maestro who mentors the young artist.", a: "Rockstar (Ranbir and Shammi Kapoor)" },
        30: { q: "Real-life brothers from the Khan family both appeared in this 2008 comedy where the protagonist receives divine powers to change his fortunes. One played the lead struggling with career troubles, the other had a supporting role.", a: "God Tussi great ho (Salman and Sohail Khan)" },
        40: { q: "Real-life mother and daughter appeared in this 2018 espionage thriller set during the 1971 Indo-Pak war. The daughter played an undercover agent married into an enemy nation's family, while her mother had a brief but important role.", a: "Raazi (Alia Bhatt and Soni Razdan)" },
        50: { q: "These real-life half-brothers both appeared in this gritty 2016 film exposing Punjab's drug crisis. One portrayed a famous musician battling addiction, while the other played a laborer trapped in the same destructive cycle.", a: "Udta Punjab (Shahid Kapoor and Ishan Khatter)" }
      }
    }
  };

  const round2Data = {
    categories: [
      "Connect the Dots",
      "Matter of Fact",
      "Brand ki Baat",
      "Almost Wonders",
      "99 Flashback"
    ],
    questions: {
      "Connect the Dots": {
        10: { q: "Washington, Lincoln, Jefferson, Roosevelt", a: "Mount Rushmore" },
        20: { q: "Caesar, Cobb, Greek, Waldorf", a: "Salads" },
        30: { q: "Scarlet, Mustard, Plum, Peacock", a: "Cluedo Characters" },
        40: { q: "Saffron, Caviar, Truffles, Kobe Beef", a: "Expensive/luxury food items" },
        50: { q: "New York City, Beehives, Playing cards, Chess", a: "Queens" }
      },
      "Matter of Fact": {
        10: { q: "Ancient Romans used this tin-copper alloy for coins and weapons, but today it's the metal behind Olympic third-place medals, church bells, and sculptures cast using the 'lost wax' method.", a: "Bronze" },
        20: { q: "This non-stick coating, discovered accidentally by a Dupont chemist in 1938, revolutionized cookware. Technically a polymer (not a metal alloy), it's used on everything from frying pans to the fabric protector on your couch.", a: "Teflon" },
        30: { q: "This iron-carbon alloy (2-4% carbon) is beloved by chefs for its superior heat retention and natural non-stick surface when seasoned. It can crack if dropped but will outlast your great-grandchildren's lifetime.", a: "Cast Iron" },
        40: { q: "This lightweight material revolutionized aviation in 1906, named after a German town near Düsseldorf. The Hindenburg's framework was built from it, and modern aircraft still rely on this aluminum-copper-magnesium combination.", a: "Duralumin" },
        50: { q: "Cardiologists thread collapsed tubes into your arteries that mysteriously expand when they reach body temperature. Orthodontists use wires of this material that apply constant gentle pressure without adjustment. It 'remembers' a programmed shape.", a: "Nitinol" }
      },
      "Brand ki Baat": {
        10: { q: "Taaza Ho le", a: "Brooke Bond Taaza" },
        20: { q: "Desh Ki Dhadkan", a: "Hero Honda" },
        30: { q: "Wires that don't catch fires", a: "Havells" },
        40: { q: "Thodi si pet puja", a: "Perk" },
        50: { q: "Badhti ka naam zindagi", a: "Axis Bank" }
      },
      "Almost Wonders": {
        10: { q: "This colossal copper statue, a gift from France to America in 1886, stands on an island in New York Harbor holding a torch and tablet. She welcomed millions of immigrants to the United States.", a: "Statue of Liberty" },
        20: { q: "This leaning bell tower in Italy began tilting during construction in the 12th century due to soft ground. Despite its 3.97-degree tilt, it has stood for over 800 years and attracts millions of tourists annually.", a: "Leaning Tower of Pisa" },
        30: { q: "This iconic white opera house with distinctive sail-like shells sits on Sydney Harbor. Opened in 1973 after 14 years of construction, it's Australia's most famous building.", a: "Sydney Opera House" },
        40: { q: "Ancient stone circle in England, estimated to be over 4,000 years old. Massive stones weighing up to 25 tons were transported from 150 miles away. Its purpose - astronomical calendar, temple, or healing site - remains debated.", a: "Stonehenge" },
        50: { q: "The largest temple complex in the world, covering over 400 acres in Cambodia. Originally Hindu, later Buddhist, built by King Suryavarman II in the 12th century. Its five towers represent Mount Meru, home of the gods.", a: "Angkor Wat" }
      },
      "99 Flashback": {
        10: { q: "This Canadian company launched a revolutionary wireless device that made mobile email accessible for the first time. Corporate executives became so dependent on constantly checking messages that it transformed business communication forever.", a: "Blackberry" },
        20: { q: "A high-altitude military conflict erupted in the Himalayan peaks when infiltrators crossed the Line of Control. Indian forces launched Operation Vijay to reclaim strategic positions, with the war ending in July after intense mountain warfare.", a: "Kargil War" },
        30: { q: "This 1999 film explored toxic masculinity and anti-consumerism through an underground movement. Based on a controversial novel, its famous first rule paradoxically made people talk about it endlessly.", a: "Fight Club" },
        40: { q: "NATO forces conducted a 78-day bombing campaign against Yugoslavia to stop ethnic cleansing in ________. The intervention, which began in March without UN Security Council approval, sparked global debates about humanitarian military action.", a: "Kosovo War" },
        50: { q: "The world braced for potential catastrophe as midnight approached on December 31st. Governments and corporations spent billions preparing for computer systems that couldn't process the date change, fearing infrastructure collapse, banking failures, and technological chaos.", a: "Y2K Bug/Millenium Bug" }
      }
    }
  };

  const currentData = currentTab === 'round1' ? round1Data : round2Data;
  const pointValues = [10, 20, 30, 40, 50];

  const handleQuestionClick = (category, points) => {
    const roundKey = currentTab;
    const questionId = `${category}-${points}`;
    
    if (!answeredQuestions[roundKey].includes(questionId)) {
      setSelectedQuestion({
        category,
        points,
        ...currentData.questions[category][points]
      });
      setShowAnswer(false);
      setBuzzedPlayer(null);
      setBuzzedPlayers([]); // Reset buzzer list
      setScoreAwarded(false);
      setAwardedTo(null);
      setScoredPlayers([]); // Reset scored players
      
      if (socket) {
        socket.emit('activate-buzzer', { category, points });
      }
    }
  };

  const handleBack = () => {
    if (selectedQuestion) {
      const roundKey = currentTab;
      const questionId = `${selectedQuestion.category}-${selectedQuestion.points}`;
      
      setAnsweredQuestions(prev => ({
        ...prev,
        [roundKey]: [...prev[roundKey], questionId]
      }));
    }
    
    setSelectedQuestion(null);
    setShowAnswer(false);
    setBuzzedPlayer(null);
    setScoreAwarded(false);
    setAwardedTo(null);
    
    if (socket) {
      socket.emit('reset-buzzer');
    }
  };

  const handleScoreUpdate = (playerId, points, playerName) => {
  if (socket) {
    socket.emit('update-score', { playerId, points });
    
    // Add to scored players list (but allow multiple clicks now)
    if (!scoredPlayers.includes(playerId)) {
      setScoredPlayers(prev => [...prev, playerId]);
    }
    
    // Show feedback
    setAwardedTo({ name: playerName, points });
    
    // Clear feedback after 1.5 seconds
    setTimeout(() => {
      setAwardedTo(null);
    }, 1500);
  }
};

  const isAnswered = (category, points) => {
    const roundKey = currentTab;
    const questionId = `${category}-${points}`;
    return answeredQuestions[roundKey].includes(questionId);
  };

  const checkRoundComplete = (round) => {
    const data = round === 'round1' ? round1Data : round2Data;
    const totalQuestions = data.categories.length * pointValues.length;
    return answeredQuestions[round].length === totalQuestions;
  };

  const handleStartRound1 = () => {
    setGamePhase('round1-active');
    setCurrentTab('round1');
  };

  const handleStartRound2 = () => {
    setGamePhase('round2-active');
    setCurrentTab('round2');
  };

  const handleShowResults = () => {
    setGamePhase('finished');
    setCurrentTab('winner');
  };

  const handleNewGame = () => {
    setGamePhase('setup');
    setCurrentTab('qr');
    setAnsweredQuestions({ round1: [], round2: [] });
    if (socket) socket.emit('reset-game');
  };

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  // Tab Navigation with access control
  const TabButton = ({ tab, label, locked = false, completed = false }) => {
    const isActive = currentTab === tab;
    const canAccess = !locked;
    
    return (
      <button
        onClick={() => canAccess && setCurrentTab(tab)}
        disabled={locked}
        className={`px-8 py-3 rounded-full font-bold text-lg transition-all flex items-center gap-2 ${
          isActive
            ? 'bg-yellow-400 text-purple-900 shadow-lg scale-105'
            : locked
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-purple-700 text-white hover:bg-purple-600'
        }`}
      >
        {locked && <Lock className="w-5 h-5" />}
        {completed && <CheckCircle className="w-5 h-5 text-green-400" />}
        {label}
      </button>
    );
  };

  // Winner Page
  if (currentTab === 'winner') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-8 flex items-center justify-center">
        <div className="max-w-4xl w-full">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 shadow-2xl text-center">
            <Trophy className="w-32 h-32 text-yellow-400 mx-auto mb-6 animate-bounce" />
            <h2 className="text-7xl font-bold text-yellow-400 mb-4">🎉 Game Over! 🎉</h2>
            <p className="text-2xl text-white mb-12">Congratulations to all players!</p>
            
            <div className="space-y-4 max-w-2xl mx-auto mb-12">
              {sortedPlayers.map((player, idx) => (
                <div
                  key={player.playerId}
                  className={`rounded-2xl p-6 flex justify-between items-center transform transition-all ${
                    idx === 0
                      ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-purple-900 scale-110 shadow-2xl'
                      : idx === 1
                      ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-900 scale-105'
                      : idx === 2
                      ? 'bg-gradient-to-r from-orange-700 to-orange-800 text-white scale-105'
                      : 'bg-white/20 text-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-5xl font-bold">
                      {idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </span>
                    <span className="text-3xl font-bold">{player.name}</span>
                  </div>
                  <span className="text-5xl font-bold">{player.score} pts</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleNewGame}
              className="px-16 py-5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-2xl rounded-full hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg hover:scale-105"
            >
              🎮 Start New Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-400 mb-6" style={{textShadow: '2px 2px 4px rgba(0,0,0,0.3)'}}>
            Kvizzing
          </h1>
          
          {/* Tab Navigation */}
          <div className="flex justify-center gap-4 flex-wrap mb-4">
            <TabButton tab="qr" label="QR Code" />
            <TabButton 
              tab="round1" 
              label="Round 1" 
              locked={gamePhase === 'setup'}
              completed={checkRoundComplete('round1')}
            />
            <TabButton 
              tab="round2" 
              label="Round 2" 
              locked={gamePhase === 'setup' || gamePhase === 'round1-active'}
              completed={checkRoundComplete('round2')}
            />
            <TabButton tab="scoreboard" label="Scoreboard" />
          </div>

          {/* Progress Indicators */}
          <div className="flex justify-center gap-6 text-white text-sm">
            {checkRoundComplete('round1') && gamePhase !== 'setup' && (
              <div className="flex items-center gap-2 bg-green-600 px-4 py-2 rounded-full">
                <CheckCircle className="w-4 h-4" />
                <span>Round 1 Complete</span>
              </div>
            )}
            {checkRoundComplete('round2') && gamePhase === 'round2-active' && (
              <div className="flex items-center gap-2 bg-green-600 px-4 py-2 rounded-full">
                <CheckCircle className="w-4 h-4" />
                <span>Round 2 Complete</span>
              </div>
            )}
          </div>
        </div>

        {/* QR Code Tab */}
        {currentTab === 'qr' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="bg-white rounded-3xl p-8 shadow-2xl">
                <h3 className="text-3xl font-bold text-purple-900 mb-6 text-center">Scan to Join!</h3>
                <div className="flex justify-center bg-white p-6 rounded-xl mb-6">
                  <QRCodeSVG value={playerUrl} size={300} />
                </div>
                <p className="text-center text-gray-600 text-lg break-all">{playerUrl}</p>
              </div>

              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl">
                <h3 className="text-3xl font-bold text-yellow-400 mb-6 flex items-center gap-3">
                  <Users className="w-8 h-8" />
                  Players Joined ({players.length})
                </h3>
                {players.length === 0 ? (
                  <div className="text-white text-center py-16">
                    <p className="text-2xl mb-4">Waiting for players...</p>
                    <p className="text-lg opacity-75">Ask players to scan the QR code!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {players.map((player, idx) => (
                      <div key={player.playerId} className="bg-white/20 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                          {idx + 1}
                        </div>
                        <span className="text-white font-semibold text-xl">{player.name}</span>
                        <span className="ml-auto text-yellow-400 font-bold text-xl">{player.score} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Start Game Button */}
            {players.length > 0 && gamePhase === 'setup' && (
              <div className="text-center">
                <button
                  onClick={handleStartRound1}
                  className="px-16 py-5 bg-gradient-to-r from-green-400 to-emerald-500 text-white font-bold text-2xl rounded-full hover:from-green-500 hover:to-emerald-600 transition-all shadow-lg flex items-center justify-center gap-3 mx-auto animate-pulse hover:animate-none"
                >
                  <Play className="w-8 h-8" />
                  Start Round 1
                </button>
              </div>
            )}

            {/* Round Complete Actions */}
            {checkRoundComplete('round1') && gamePhase === 'round1-active' && (
              <div className="text-center">
                <button
                  onClick={handleStartRound2}
                  className="px-16 py-5 bg-gradient-to-r from-blue-400 to-indigo-500 text-white font-bold text-2xl rounded-full hover:from-blue-500 hover:to-indigo-600 transition-all shadow-lg flex items-center justify-center gap-3 mx-auto animate-pulse hover:animate-none"
                >
                  <Play className="w-8 h-8" />
                  Start Round 2
                </button>
              </div>
            )}

            {checkRoundComplete('round2') && gamePhase === 'round2-active' && (
              <div className="text-center">
                <button
                  onClick={handleShowResults}
                  className="px-16 py-5 bg-gradient-to-r from-yellow-400 to-orange-500 text-purple-900 font-bold text-2xl rounded-full hover:from-yellow-500 hover:to-orange-600 transition-all shadow-lg flex items-center justify-center gap-3 mx-auto animate-pulse hover:animate-none"
                >
                  <Trophy className="w-8 h-8" />
                  Show Final Results
                </button>
              </div>
            )}
          </div>
        )}

        {/* Round 1 & Round 2 Tabs */}
        {(currentTab === 'round1' || currentTab === 'round2') && (
          <div>
            {/* Round Complete Banner */}
            {checkRoundComplete(currentTab) && (
              <div className="bg-green-500 text-white px-8 py-4 rounded-2xl text-center mb-6 text-xl font-bold">
                🎉 {currentTab === 'round1' ? 'Round 1' : 'Round 2'} Complete! 
                {currentTab === 'round1' && gamePhase === 'round1-active' && ' Go to QR Code tab to start Round 2!'}
                {currentTab === 'round2' && gamePhase === 'round2-active' && ' Go to QR Code tab to see final results!'}
              </div>
            )}

            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 shadow-2xl">
              <div className="grid grid-cols-5 gap-3">
                {currentData.categories.map((category, idx) => (
                  <div
                    key={idx}
                    className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl p-4 text-center shadow-lg"
                  >
                    <h3 className="text-white font-bold text-sm leading-tight">{category}</h3>
                  </div>
                ))}

                {pointValues.map((points) => (
                  <React.Fragment key={points}>
                    {currentData.categories.map((category, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleQuestionClick(category, points)}
                        disabled={isAnswered(category, points)}
                        className={`rounded-xl p-6 text-4xl font-bold transition-all duration-300 shadow-lg ${
                          isAnswered(category, points)
                            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed opacity-30'
                            : 'bg-gradient-to-br from-cyan-400 to-blue-500 text-white hover:scale-105 hover:shadow-2xl cursor-pointer active:scale-95'
                        }`}
                      >
                        {isAnswered(category, points) ? '✓' : points}
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scoreboard Tab */}
        {currentTab === 'scoreboard' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 shadow-2xl max-w-4xl mx-auto">
            <h2 className="text-5xl font-bold text-yellow-400 mb-8 text-center flex items-center justify-center gap-4">
              <Trophy className="w-12 h-12" />
              Current Standings
            </h2>
            
            {players.length === 0 ? (
              <p className="text-white text-center text-2xl py-12">No players yet...</p>
            ) : (
              <div className="space-y-4">
                {sortedPlayers.map((player, idx) => (
                  <div
                    key={player.playerId}
                    className={`rounded-2xl p-6 flex justify-between items-center transition-all ${
                      idx === 0
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-purple-900 scale-105 shadow-2xl'
                        : idx === 1
                        ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-900'
                        : idx === 2
                        ? 'bg-gradient-to-r from-orange-700 to-orange-800 text-white'
                        : 'bg-white/20 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-4xl font-bold">
                        {idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                      </span>
                      <span className="text-2xl font-bold">{player.name}</span>
                    </div>
                    <span className="text-4xl font-bold">{player.score} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Question Modal */}
        {selectedQuestion && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl p-8 max-w-3xl w-full shadow-2xl relative animate-scale-in max-h-[90vh] overflow-y-auto">
              <button
                onClick={handleBack}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-2 transition-all"
              >
                <X className="w-6 h-6 text-white" />
              </button>

              <div className="text-center mb-6">
  <div className="inline-block bg-yellow-400 text-purple-900 px-6 py-2 rounded-full font-bold text-lg mb-3">
    {selectedQuestion.category} - {selectedQuestion.points} Points
  </div>
</div>

{/* Buzzer Status - List of who buzzed */}
{buzzedPlayers.length > 0 && (
  <div className="mb-6">
    <div className="bg-yellow-400 text-purple-900 px-6 py-4 rounded-2xl text-xl font-bold mb-3 text-center">
      🔔 First: {buzzedPlayers[0].name}
    </div>
    {buzzedPlayers.length > 1 && (
      <div className="bg-white/20 rounded-xl p-4">
        <h4 className="text-white font-bold text-center mb-2">Others who buzzed (in order):</h4>
        <div className="flex flex-wrap gap-2 justify-center">
          {buzzedPlayers.slice(1).map((buzzer, idx) => (
            <span key={buzzer.playerId} className="bg-white/30 text-white px-3 py-1 rounded-full text-sm">
              #{idx + 2}: {buzzer.name}
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
)}

              <div className="bg-white/10 backdrop-blur rounded-2xl p-6 mb-6">
                <h2 className="text-2xl font-bold text-white text-center mb-4">Question:</h2>
                <p className="text-xl text-white text-center leading-relaxed">{selectedQuestion.q}</p>
              </div>

              {showAnswer ? (
                <>
                  <div className="bg-green-500/20 border-2 border-green-400 rounded-2xl p-6 mb-6 animate-scale-in">
                    <h3 className="text-xl font-bold text-green-300 text-center mb-3">Answer:</h3>
                    <p className="text-2xl text-white text-center font-semibold">{selectedQuestion.a}</p>
                  </div>

                  {/* Score Awarded Confirmation */}
                  {scoreAwarded && awardedTo && (
                    <div className="bg-yellow-400 text-purple-900 px-6 py-4 rounded-2xl text-xl font-bold mb-6 text-center animate-scale-in">
                      {awardedTo.points > 0 ? '✅' : '❌'} {awardedTo.points > 0 ? '+' : ''}{awardedTo.points} points awarded to {awardedTo.name}!
                      <p className="text-sm mt-2 opacity-75">Returning to board...</p>
                    </div>
                  )}

                  {!scoreAwarded ? (
                    <div className="mb-6">
                      <h4 className="text-white font-bold text-center mb-4 text-xl">Award/Deduct Points:</h4>
                      <div className="grid grid-cols-1 gap-3 mb-4">
                        {sortedPlayers.map((player) => {
  const alreadyScored = scoredPlayers.includes(player.playerId);
  return (
    <div key={player.playerId} className="flex gap-2">
      <button
        onClick={() => handleScoreUpdate(player.playerId, selectedQuestion.points, player.name)}
        className={`flex-1 font-bold py-4 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95 ${
          alreadyScored 
            ? 'bg-green-600 opacity-70' 
            : 'bg-green-500 hover:bg-green-600'
        } text-white`}
      >
        <span className="text-3xl">✓</span>
        <span className="text-lg">{player.name}</span>
        <span className="text-yellow-300 text-lg font-bold">+{selectedQuestion.points}</span>
      </button>
      <button
        onClick={() => handleScoreUpdate(player.playerId, -selectedQuestion.points, player.name)}
        className={`flex-1 font-bold py-4 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95 ${
          alreadyScored 
            ? 'bg-red-600 opacity-70' 
            : 'bg-red-500 hover:bg-red-600'
        } text-white`}
      >
        <span className="text-3xl">✗</span>
        <span className="text-lg">{player.name}</span>
        <span className="text-red-200 text-lg font-bold">−{selectedQuestion.points}</span>
      </button>
    </div>
  );
})}
                      </div>
                      
                      <button
                        onClick={handleBack}
                        className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-xl transition-all"
                      >
                        Skip (No Points)
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="w-full bg-gradient-to-r from-green-400 to-emerald-500 text-white font-bold py-4 px-8 rounded-xl text-xl hover:from-green-500 hover:to-emerald-600 transition-all shadow-lg hover:shadow-xl active:scale-95 mb-4"
                >
                  Show Answer
                </button>
              )}

              {!scoreAwarded && (
                <button
                  onClick={handleBack}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back to Board
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};

export default KvizzingGame;