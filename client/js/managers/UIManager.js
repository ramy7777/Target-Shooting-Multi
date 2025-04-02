import * as THREE from 'three';

export class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.gameStarted = false;
        this.raycaster = new THREE.Raycaster();
        this.tempMatrix = new THREE.Matrix4();
        this.intersected = null;
        
        // Timer properties
        this.gameStartTime = 0;
        this.gameDuration = 120000; // 120 seconds
        this.timerInterval = null;
        this.lastTimerSync = 0; // Added this line
    }

    update() {
        // Only send timer syncs if we're the host and game is started
        if (this.engine.networkManager?.isHost && this.gameStarted) {
            const currentTime = Date.now();
            // Send sync every 1 second
            if (currentTime - this.lastTimerSync >= 1000) { 
                this.lastTimerSync = currentTime;
                const gameTime = Math.floor((currentTime - this.gameStartTime) / 1000);
                const remainingTime = Math.max(0, this.gameDuration - (currentTime - this.gameStartTime));
                
                console.log('[UI] Sending timer sync - Game time:', gameTime, 's, Remaining:', Math.floor(remainingTime / 1000), 's');
                
                this.engine.networkManager.send({
                    type: 'timerSync',
                    data: {
                        currentTime: currentTime,
                        gameStartTime: this.gameStartTime,
                        gameDuration: this.gameDuration,
                        gameTime: gameTime,
                        remainingTime: remainingTime
                    }
                });
            }
        }
    }

    handleGameStart() {
        if (this.gameStarted) {
            console.log('[GAME_START] Game already started');
            return;
        }
        
        // Reset game state
        this.stopTimer();
        this.gameStarted = true;
        this.gameStartTime = Date.now();
        this.lastTimerSync = 0;
        
        console.log('[GAME_START] Starting game at:', new Date(this.gameStartTime).toISOString());
        
        // Hide start button in VR score UI
        if (this.engine.scoreManager?.vrScoreUI?.startButton) {
            console.log('[GAME_START] Hiding start button');
            this.engine.scoreManager.vrScoreUI.startButton.visible = false;
        }
        
        // Start the game locally first
        console.log('[GAME_START] Starting local game');
        this.startGame();
        this.startTimer(); // This will set up timerInterval and start updates

        // Immediately send timer sync if host
        if (this.engine.networkManager?.isHost) {
            const startData = {
                startTime: this.gameStartTime,
                duration: this.gameDuration
            };
            console.log('[GAME_START] Sending start game event to network:', startData);
            this.engine.networkManager.send({
                type: 'gameStart',
                data: startData
            });
            
            // Immediately send a timer sync
            this.engine.networkManager.send({
                type: 'timerSync',
                data: {
                    currentTime: Date.now(),
                    gameStartTime: this.gameStartTime,
                    gameDuration: this.gameDuration,
                    gameTime: 0,
                    remainingTime: this.gameDuration
                }
            });
        }
    }

    startGame() {
        // Start bird spawning
        if (this.engine.birdManager) {
            console.log('[GAME_START] Starting bird spawning');
            this.engine.birdManager.isSpawning = true;
        }
    }

    startTimer() {
        if (!this.gameStarted) {
            console.log('[TIMER] Cannot start timer, game not started');
            return;
        }

        if (this.timerInterval) {
            console.log('[TIMER] Clearing existing timer interval');
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        console.log('[TIMER] Starting timer at:', new Date(this.gameStartTime).toISOString());
        
        // Update immediately
        this.updateTimer();
        
        // Start the timer interval
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
        
        console.log('[TIMER] Timer started successfully');
    }

    handleNetworkGameStart(data) {
        if (!data.startTime || !data.duration) {
            console.error('[NETWORK_GAME_START] Invalid game start data:', data);
            return;
        }

        // Stop any existing timer
        this.stopTimer();
        
        // Set game state
        this.gameStarted = true;
        this.gameStartTime = data.startTime;
        this.gameDuration = data.duration;
        
        // Calculate time difference between host time and client time
        const timeDiff = Date.now() - data.currentTime;
        if (data.currentTime) {
            // Adjust game start time by the time difference
            this.gameStartTime += timeDiff;
            console.log('[NETWORK_GAME_START] Adjusted start time by time diff:', timeDiff, 'ms');
        }
        
        console.log('[NETWORK_GAME_START] Game state set:', {
            started: this.gameStarted,
            startTime: new Date(this.gameStartTime).toISOString(),
            duration: this.gameDuration
        });
        
        // Hide start button in VR score UI
        if (this.engine.scoreManager?.vrScoreUI?.startButton) {
            console.log('[NETWORK_GAME_START] Hiding start button');
            this.engine.scoreManager.vrScoreUI.startButton.visible = false;
        }
        
        // Start the game
        console.log('[NETWORK_GAME_START] Starting game and timer');
        this.startGame();
        this.startTimer();
    }

    handleTimerSync(data) {
        if (!this.gameStarted) {
            console.log('[UI] Initializing timer from sync - game not started locally');
            this.gameStarted = true;
            this.gameStartTime = data.gameStartTime;
            this.gameDuration = data.gameDuration;
            this.startTimer();
            return;
        }

        const { currentTime, gameStartTime, gameDuration, gameTime } = data;
        
        // Update game start time and duration
        this.gameStartTime = gameStartTime;
        this.gameDuration = gameDuration;
        
        // Calculate time difference between host and client
        const timeDiff = Date.now() - currentTime;
        
        // Adjust game start time by the time difference
        this.gameStartTime += timeDiff;
        
        console.log('[UI] Timer synced - Game time:', gameTime, 's, Time diff:', timeDiff, 'ms');
        
        // Make sure timer is running
        if (!this.timerInterval) {
            console.log('[UI] Starting timer after sync');
            this.startTimer();
        } else {
            // Just update the timer display
            this.updateTimer();
        }
    }

    handleGameEnd() {
        console.log('[GAME_END] Ending game');
        // Clear timer interval
        this.stopTimer();
        
        // Reset game state
        this.gameStarted = false;
        this.gameStartTime = 0;
        
        // Show start button in VR score UI
        if (this.engine.scoreManager.vrScoreUI && this.engine.scoreManager.vrScoreUI.startButton) {
            this.engine.scoreManager.vrScoreUI.startButton.visible = true;
        }
        
        // Stop bird spawning and remove all birds
        if (this.engine.birdManager) {
            this.engine.birdManager.isSpawning = false;
            this.engine.birdManager.birds.forEach((bird, id) => {
                this.engine.birdManager.removeBird(id);
            });
        }
        
        // Send game end event if we're the host
        if (this.engine.networkManager?.isHost) {
            this.engine.networkManager.send({
                type: 'gameEnd',
                senderId: this.engine.networkManager.localPlayerId
            });
        }
    }

    handleNetworkGameEnd() {
        // Reset game state
        this.gameStarted = false;
        this.gameStartTime = 0;
        
        // Show start button in VR score UI
        if (this.engine.scoreManager.vrScoreUI && this.engine.scoreManager.vrScoreUI.startButton) {
            this.engine.scoreManager.vrScoreUI.startButton.visible = true;
        }
        
        // Stop bird spawning and remove all birds
        if (this.engine.birdManager) {
            this.engine.birdManager.isSpawning = false;
            this.engine.birdManager.birds.forEach((bird, id) => {
                this.engine.birdManager.removeBird(id);
            });
        }
    }

    updateTimer() {
        if (!this.gameStarted || !this.gameStartTime) {
            console.log('[TIMER] Game not started or no start time. Started:', this.gameStarted, 'Start time:', this.gameStartTime);
            return;
        }
        
        const currentTime = Date.now();
        const elapsedTime = currentTime - this.gameStartTime;
        const remainingTime = Math.max(0, this.gameDuration - elapsedTime);
        
        // Convert to seconds and format
        const seconds = Math.ceil(remainingTime / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const timeText = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        
        console.log('[TIMER] Updating display:', {
            currentTime,
            gameStartTime: this.gameStartTime,
            elapsedTime,
            remainingTime,
            formattedTime: timeText
        });
        
        // Update VRScoreUI timer display
        if (this.engine.scoreManager && this.engine.scoreManager.vrScoreUI) {
            this.engine.scoreManager.vrScoreUI.updateTimer(timeText);
        } else {
            console.error('[TIMER] VRScoreUI not found');
        }
        
        // End game if time is up
        if (remainingTime <= 0) {
            console.log('[TIMER] Time is up');
            if (this.engine.networkManager?.isHost) {
                this.handleGameEnd();
            } else {
                // For non-host clients, just stop the timer
                this.stopTimer();
            }
        }
    }

    stopTimer() {
        if (this.timerInterval) {
            console.log('[TIMER] Stopping timer');
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}
