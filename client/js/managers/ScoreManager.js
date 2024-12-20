import { VRScoreUI } from '../ui/VRScoreUI.js';

class ScoreManager {
    constructor(engine) {
        this.engine = engine;
        this.scores = new Map();
        this.pointsPerHit = 10;
        
        // Create both 2D and VR UIs
        this.createScoreUI();
        this.initVRScoreUI();
    }

    async initVRScoreUI() {
        try {
            this.vrScoreUI = new VRScoreUI(this.engine);
            console.log('[SCORE] VRScoreUI initialized');
        } catch (error) {
            console.error('[SCORE] Failed to initialize VRScoreUI:', error);
        }
    }

    createScoreUI() {
        // Create and style the score container
        const scoreContainer = document.createElement('div');
        scoreContainer.id = 'score-container';
        scoreContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: linear-gradient(180deg, rgba(25, 25, 35, 0.95), rgba(15, 15, 25, 0.95));
            color: #ffffff;
            padding: 20px;
            border-radius: 15px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-family: 'Segoe UI', Arial, sans-serif;
            z-index: 1000;
            pointer-events: none;
            min-width: 250px;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3),
                        0 0 15px rgba(255, 255, 255, 0.05);
        `;

        // Create title
        const title = document.createElement('div');
        title.textContent = 'LEADERBOARD';
        title.style.cssText = `
            font-size: 22px;
            font-weight: 600;
            text-align: center;
            margin-bottom: 15px;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 2px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        `;
        scoreContainer.appendChild(title);

        // Create scores list container
        this.scoresList = document.createElement('div');
        this.scoresList.style.cssText = `
            font-size: 16px;
            line-height: 1.6;
        `;
        scoreContainer.appendChild(this.scoresList);

        // Add to document
        document.body.appendChild(scoreContainer);
        console.debug('[DEBUG] Created score UI in browser');
    }

    addPlayer(playerId) {
        if (!this.scores.has(playerId)) {
            this.scores.set(playerId, 0);
            this.updateScoreDisplay();
            console.debug('[DEBUG] Added player:', playerId);
        }
    }

    updateScore(playerId, points) {
        // Get current score and add points
        const currentScore = this.scores.get(playerId) || 0;
        const newScore = currentScore + points;
        
        // Update scores map
        this.scores.set(playerId, newScore);

        // Update score display
        this.updateScoreDisplay();

        // Update VR score display if available
        if (this.vrScoreUI) {
            // Get player's rank
            const rank = Array.from(this.scores.entries())
                .sort((a, b) => b[1] - a[1])
                .findIndex(([id]) => id === playerId);
            this.vrScoreUI.updatePlayerScore(playerId, newScore, rank);
        }
    }

    handleNetworkScoreUpdate(data) {
        const { playerId, score } = data;
        
        if (!this.scores.has(playerId)) {
            this.addPlayer(playerId);
        }
        
        this.scores.set(playerId, score);
        this.updateScoreDisplay();
    }

    removePlayer(playerId) {
        this.scores.delete(playerId);
        this.updateScoreDisplay();
        this.vrScoreUI.removePlayer(playerId);
    }

    update(deltaTime) {
        // Update VR score UI position
        if (this.engine.renderer.xr.isPresenting) {
            this.vrScoreUI.update();
        }
    }

    updateScoreDisplay() {
        // Clear current scores
        this.scoresList.innerHTML = '';
        
        // Sort players by score
        const sortedScores = Array.from(this.scores.entries())
            .sort((a, b) => b[1] - a[1]); // Sort by score descending
        
        // Add each score
        sortedScores.forEach(([playerId, score], index) => {
            const scoreElement = document.createElement('div');
            const isLocalPlayer = this.engine.playerManager?.localPlayer?.id === playerId;
            
            scoreElement.style.cssText = `
                margin: 8px 0;
                padding: 10px 15px;
                border-radius: 10px;
                background: ${isLocalPlayer ? 
                    'linear-gradient(90deg, rgba(64, 153, 255, 0.15), rgba(64, 153, 255, 0.05))' : 
                    'rgba(255, 255, 255, 0.03)'};
                border: 1px solid ${isLocalPlayer ? 
                    'rgba(64, 153, 255, 0.3)' : 
                    'rgba(255, 255, 255, 0.05)'};
                transition: all 0.3s ease;
                display: flex;
                justify-content: space-between;
                align-items: center;
                ${index === 0 ? 'background: linear-gradient(90deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05));' : ''}
                ${index === 1 ? 'background: linear-gradient(90deg, rgba(192, 192, 192, 0.15), rgba(192, 192, 192, 0.05));' : ''}
                ${index === 2 ? 'background: linear-gradient(90deg, rgba(205, 127, 50, 0.15), rgba(205, 127, 50, 0.05));' : ''}
            `;
            
            // Create rank indicator
            const rankSpan = document.createElement('span');
            rankSpan.style.cssText = `
                font-size: 14px;
                color: ${index < 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][index] : '#888'};
                margin-right: 10px;
                font-weight: bold;
            `;
            rankSpan.textContent = `#${index + 1}`;
            
            // Create player name span
            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = `
                flex-grow: 1;
                margin: 0 10px;
                font-weight: ${isLocalPlayer ? '600' : 'normal'};
                color: ${isLocalPlayer ? '#4099ff' : '#fff'};
            `;
            nameSpan.textContent = isLocalPlayer ? 'You' : `Player ${playerId}`;
            
            // Create score span
            const scoreSpan = document.createElement('span');
            scoreSpan.style.cssText = `
                font-weight: bold;
                color: ${index === 0 ? '#FFD700' : 
                        index === 1 ? '#C0C0C0' : 
                        index === 2 ? '#CD7F32' : '#fff'};
                min-width: 60px;
                text-align: right;
            `;
            scoreSpan.textContent = score;
            
            scoreElement.appendChild(rankSpan);
            scoreElement.appendChild(nameSpan);
            scoreElement.appendChild(scoreSpan);
            
            this.scoresList.appendChild(scoreElement);
        });
    }

    resetScores() {
        console.log('[SCORE] Resetting all scores');
        this.scores.clear();
        
        // Reset UI if available
        if (this.vrScoreUI) {
            // Clear all existing score displays
            for (const playerId of this.scores.keys()) {
                this.vrScoreUI.removePlayer(playerId);
            }
        }

        // Network the score reset if we're the host
        if (this.engine.networkManager?.isHost) {
            this.engine.networkManager.send({
                type: 'scoreReset',
                senderId: this.engine.networkManager.localPlayerId
            });
        }
    }
}

export { ScoreManager };
