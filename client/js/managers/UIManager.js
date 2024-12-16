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
    }

    update() {
        // Update timer if game is started
        // this.updateTimer(); // Removed this line
    }

    handleGameStart() {
        if (this.gameStarted) {
            console.log('[GAME_START] Game already started');
            return;
        }
        
        console.log('[GAME_START] Starting game...');
        this.gameStarted = true;
        this.gameStartTime = Date.now();
        
        // Hide start button in VR score UI
        if (this.engine.scoreManager.vrScoreUI && this.engine.scoreManager.vrScoreUI.startButton) {
            console.log('[GAME_START] Hiding start button');
            this.engine.scoreManager.vrScoreUI.startButton.visible = false;
        }
        
        // Send start game event to all players with synchronized time
        if (this.engine.networkManager) {
            const startData = {
                startTime: this.gameStartTime,
                duration: this.gameDuration
            };
            console.log('[GAME_START] Sending start game event to network:', startData);
            this.engine.networkManager.send({
                type: 'gameStart',
                data: startData,
                senderId: this.engine.networkManager.localPlayerId
            });
        }

        // Start the game locally
        console.log('[GAME_START] Starting local game');
        this.startGame();
        this.updateTimer(); // Update timer immediately
        this.startTimer();
    }

    startGame() {
        // Start bird spawning
        if (this.engine.birdManager) {
            console.log('[GAME_START] Starting bird spawning');
            this.engine.birdManager.isSpawning = true;
        }
    }

    startTimer() {
        console.log('[TIMER] Starting timer, game start time:', this.gameStartTime);
        if (this.timerInterval) {
            console.log('[TIMER] Clearing existing timer interval');
            clearInterval(this.timerInterval);
        }
        
        // Update immediately
        this.updateTimer();
        
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
    }

    handleNetworkGameStart(data) {
        if (this.gameStarted) {
            console.log('[NETWORK_GAME_START] Game already started');
            return;
        }
        
        console.log('[NETWORK_GAME_START] Received game start event:', data);
        
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
        
        console.log('[NETWORK_GAME_START] Game state set:', {
            started: this.gameStarted,
            startTime: this.gameStartTime,
            duration: this.gameDuration
        });
        
        // Hide start button in VR score UI
        if (this.engine.scoreManager.vrScoreUI && this.engine.scoreManager.vrScoreUI.startButton) {
            console.log('[NETWORK_GAME_START] Hiding start button');
            this.engine.scoreManager.vrScoreUI.startButton.visible = false;
        }
        
        // Start the game
        console.log('[NETWORK_GAME_START] Starting game with time:', this.gameStartTime);
        this.startGame();
        
        // Force an immediate timer update
        this.updateTimer();
        
        // Start the timer interval
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
        
        console.log('[NETWORK_GAME_START] Timer started');
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
        
        console.log('[TIMER] Timer state:', {
            currentTime,
            gameStartTime: this.gameStartTime,
            elapsedTime,
            remainingTime
        });
        
        // Convert to seconds and format
        const seconds = Math.ceil(remainingTime / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const timeText = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        
        // Update VRScoreUI timer display
        if (this.engine.scoreManager && this.engine.scoreManager.vrScoreUI) {
            console.log('[TIMER] Updating timer display:', timeText);
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
