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
        if (this.gameStarted) return;
        
        // Reset scores before starting new game
        if (this.engine.scoreManager) {
            this.engine.scoreManager.resetScores();
        }

        // Remove any remaining spheres
        if (this.engine.sphereManager) {
            this.engine.sphereManager.removeAllSpheres();
        }
        
        // Start the game
        this.gameStarted = true;
        this.gameStartTime = Date.now();
        
        // Start the ball
        if (this.engine.world) {
            this.engine.world.startGame();
        }
        
        // Hide start button in VR score UI
        if (this.engine.vrScoreUI && this.engine.vrScoreUI.startButton) {
            this.engine.vrScoreUI.startButton.visible = false;
        }
        
        // Start the timer
        this.startTimer();
        
        // Send game start event if we're the host
        if (this.engine.networkManager?.isHost) {
            const startData = {
                startTime: this.gameStartTime,
                duration: this.gameDuration
            };
            this.engine.networkManager.send({
                type: 'gameStart',
                data: startData,
                senderId: this.engine.networkManager.localPlayerId
            });
        }

        // Start the game locally
        this.startGame();
        this.updateTimer(); // Update timer immediately
    }

    startGame() {
        // Start bird spawning
        if (this.engine.birdManager) {
            console.log('[GAME_START] Starting bird spawning');
            this.engine.birdManager.isSpawning = true;
        }
    }

    startTimer() {
        if (this.timerInterval) {
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

        // Start the game and spawn ball for clients
        if (this.engine.world) {
            this.engine.world.startGame();
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
        // Clear timer interval
        this.stopTimer();
        
        // Reset game state
        this.gameStarted = false;
        this.gameStartTime = 0;
        
        // Show start button only to host
        if (this.engine.networkManager.isHost) {
            if (this.engine.scoreManager.vrScoreUI?.startButton) {
                this.engine.scoreManager.vrScoreUI.startButton.visible = true;
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
        if (!this.gameStarted || !this.gameStartTime) return;
        
        const currentTime = Date.now();
        const elapsedTime = currentTime - this.gameStartTime;
        const remainingTime = Math.max(0, this.gameDuration - elapsedTime);
        
        // Convert to seconds and format
        const seconds = Math.ceil(remainingTime / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const timeText = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        
        // Update VRScoreUI timer display
        if (this.engine.scoreManager?.vrScoreUI) {
            this.engine.scoreManager.vrScoreUI.updateTimer(timeText);
        }
        
        // End game if time is up
        if (remainingTime <= 0) {
            this.handleGameEnd();
            this.stopTimer();
        }
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}
