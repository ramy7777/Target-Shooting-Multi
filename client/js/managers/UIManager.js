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
        this.gameDuration = 30000; // 30 seconds
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
        
        // Reset scores before starting new game
        if (this.engine.scoreManager) {
            console.log('[GAME_START] Resetting scores');
            this.engine.scoreManager.resetScores();
        }

        // Remove any remaining spheres
        if (this.engine.sphereManager) {
            console.log('[GAME_START] Cleaning up remaining spheres');
            this.engine.sphereManager.removeAllSpheres();
        }
        
        this.gameStarted = true;
        this.gameStartTime = Date.now();
        
        // Hide start button in VR score UI
        if (this.engine.vrScoreUI && this.engine.vrScoreUI.startButton) {
            console.log('[GAME_START] Hiding start button');
            this.engine.vrScoreUI.startButton.visible = false;
        }
        
        // Send start game event to all players with synchronized time
        if (this.engine.networkManager?.isHost) {
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
        console.log('[NETWORK] Handling game start:', data);
        
        // Reset scores for network game start
        if (this.engine.scoreManager) {
            console.log('[NETWORK] Resetting scores for network game');
            this.engine.scoreManager.handleNetworkScoreReset();
        }

        this.gameStarted = true;
        this.gameStartTime = data.startTime;
        this.gameDuration = data.duration;

        // Hide start button for all clients
        if (this.engine.vrScoreUI && this.engine.vrScoreUI.startButton) {
            this.engine.vrScoreUI.startButton.visible = false;
        }

        // Start the game
        this.startGame();
        this.updateTimer();
        this.startTimer();
    }

    handleTimerEnd() {
        console.log('[TIMER] Game ended');
        this.gameStarted = false;
        this.stopTimer();

        // Show start button only for host
        if (this.engine.networkManager?.isHost && this.engine.scoreManager.vrScoreUI?.startButton) {
            console.log('[TIMER] Showing start button for host');
            this.engine.scoreManager.vrScoreUI.startButton.visible = true;
        }

        // Remove all spheres when timer ends
        if (this.engine.sphereManager) {
            console.log('[TIMER] Cleaning up spheres at game end');
            try {
                const spheres = Array.from(this.engine.sphereManager.spheres.entries());
                for (const [id, sphere] of spheres) {
                    this.engine.sphereManager.removeSphere(id);
                }
            } catch (error) {
                console.error('[TIMER] Error cleaning up spheres:', error);
            }
        }

        // Broadcast game end to all clients
        if (this.engine.networkManager?.isHost) {
            console.log('[TIMER] Broadcasting game end to clients');
            this.engine.networkManager.send({
                type: 'gameEnd',
                senderId: this.engine.networkManager.localPlayerId
            });
        }
    }

    handleNetworkGameEnd() {
        console.log('[NETWORK] Received game end');
        this.gameStarted = false;
        this.stopTimer();

        // Remove all spheres for clients too
        if (this.engine.sphereManager) {
            console.log('[NETWORK] Cleaning up spheres at game end');
            try {
                const spheres = Array.from(this.engine.sphereManager.spheres.entries());
                for (const [id, sphere] of spheres) {
                    this.engine.sphereManager.removeSphere(id);
                }
            } catch (error) {
                console.error('[NETWORK] Error cleaning up spheres:', error);
            }
        }
    }

    handleGameEnd() {
        console.log('[GAME_END] Ending game');
        // Clear timer interval
        this.stopTimer();
        
        // Reset game state
        this.gameStarted = false;
        this.gameStartTime = 0;
        
        // Show start button only to host
        if (this.engine.networkManager.isHost) {
            if (this.engine.scoreManager.vrScoreUI && this.engine.scoreManager.vrScoreUI.startButton) {
                this.engine.scoreManager.vrScoreUI.startButton.visible = true;
                console.log('[UI] Start button shown to host after game end');
            }
        }
        
        // Stop bird spawning and remove all birds
        if (this.engine.birdManager) {
            this.engine.birdManager.isSpawning = false;
            this.engine.birdManager.birds.forEach((bird, id) => {
                this.engine.birdManager.removeBird(id);
            });
        }

        // Remove all spheres
        if (this.engine.sphereManager) {
            this.engine.sphereManager.spheres.forEach((sphere, id) => {
                this.engine.sphereManager.removeSphere(id);
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
            this.handleGameEnd();
            this.stopTimer();
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
