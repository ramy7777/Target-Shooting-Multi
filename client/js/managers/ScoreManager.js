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
            console.log('[SCORE] Initializing VRScoreUI...');
            if (!this.vrScoreUI) {
                this.vrScoreUI = new VRScoreUI(this.engine);
                console.log('[SCORE] VRScoreUI created');
            }
            
            // Initialize existing scores in VR UI
            if (this.scores.size > 0) {
                console.log('[SCORE] Initializing existing scores in VR UI');
                const sortedScores = Array.from(this.scores.entries())
                    .sort((a, b) => b[1] - a[1]); // Sort by score descending
                
                sortedScores.forEach(([playerId, score], rank) => {
                    console.log(`[SCORE] Adding Player ${playerId} with score ${score} at rank ${rank} to VR UI`);
                    this.vrScoreUI.updatePlayerScore(playerId, score, rank);
                });
            }
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
            this.updateVRScores();
        }
    }

    updateVRScores() {
        if (!this.vrScoreUI) {
            console.warn('[SCORE] Cannot update VR scores - VR Score UI not available');
            return;
        }
        
        try {
            // Get sorted players by score
            const sortedScores = Array.from(this.scores.entries())
                .sort((a, b) => b[1] - a[1]);
            
            console.log('[SCORE] Updating VR scores with data:', 
                sortedScores.map(([id, score]) => `Player ${id}: ${score}`).join(', '));
            
            // First, ensure all players exist in the UI
            for (const [playerId, _] of this.scores) {
                if (!this.vrScoreUI.textMeshes.has(playerId)) {
                    console.log(`[SCORE] Player ${playerId} not in VR UI, will be added`);
                }
            }
            
            // Update each player's score and rank
            sortedScores.forEach(([playerId, score], rank) => {
                try {
                    console.log(`[SCORE] Updating VR score for Player ${playerId}: score=${score}, rank=${rank}`);
                    this.vrScoreUI.updatePlayerScore(playerId, score, rank);
                } catch (error) {
                    console.error(`[SCORE] Error updating VR score for Player ${playerId}:`, error);
                }
            });
            
            // Ensure UI is repositioned properly
            this.vrScoreUI.repositionScores();
        } catch (error) {
            console.error('[SCORE] Error in updateVRScores:', error);
        }
    }

    handleNetworkScoreUpdate(data) {
        const { playerId, score, isSync } = data;
        
        console.log(`[SCORE] Received network score update for Player ${playerId}: ${score}${isSync ? ' (sync update)' : ''}`);
        
        // Enhanced debugging
        console.log(`[SCORE] Current scores before update:`, 
            Array.from(this.scores.entries()).map(([id, val]) => `Player ${id}: ${val}`).join(', '));
        
        // Always add player if not present
        if (!this.scores.has(playerId)) {
            console.log(`[SCORE] Adding new player ${playerId} to score table`);
            this.addPlayer(playerId);
        }
        
        // Check if this is a duplicate update for the same score (ignore for sync updates)
        const currentScore = this.scores.get(playerId);
        if (currentScore === score && !isSync) {
            console.log(`[SCORE] Ignoring duplicate score update for Player ${playerId}: ${score}`);
            return;
        }
        
        // Detect abnormally large score jumps that suggest duplicate processing
        // But skip this check for sync updates which are authoritative
        if (!isSync && currentScore > 0 && score === currentScore + 20 && score % 20 === 0) {
            console.log(`[SCORE] Detected potential duplicate scoring - ignoring update`);
            return;
        }
        
        // For sync updates, always accept the host's value
        if (isSync) {
            console.log(`[SCORE] Accepting authoritative score sync from host`);
        } else if (this.engine.networkManager?.isHost && playerId !== this.engine.networkManager.localPlayerId) {
            // If we're host and this is a non-host player's score, validate it
            console.log(`[SCORE] Host validating client score update`);
        }
        
        // Update the score
        this.scores.set(playerId, score);
        console.log(`[SCORE] Updated score for Player ${playerId} to ${score}`);
        
        // Refresh the UI
        this.updateScoreDisplay();
        
        // Update VR Score UI with all scores to ensure proper order
        if (this.vrScoreUI) {
            console.log(`[SCORE] Updating VR score display after network update`);
            this.updateVRScores();
        } else {
            console.warn('[SCORE] VR Score UI not initialized yet');
        }
        
        // Log final state for debugging
        console.log(`[SCORE] Current scores after update:`, 
            Array.from(this.scores.entries()).map(([id, val]) => `Player ${id}: ${val}`).join(', '));
    }

    removePlayer(playerId) {
        this.scores.delete(playerId);
        this.updateScoreDisplay();
        
        // Remove player from VR UI
        if (this.vrScoreUI) {
            this.vrScoreUI.removePlayer(playerId);
            
            // Update remaining players' positions
            this.updateVRScores();
        }
    }

    resetScores() {
        console.log('[SCORE] Resetting all scores to zero');
        
        // Store player IDs
        const playerIds = Array.from(this.scores.keys());
        
        // Reset all scores to zero
        playerIds.forEach(playerId => {
            this.scores.set(playerId, 0);
        });
        
        // Update displays
        this.updateScoreDisplay();
        
        // Update VR Score UI with reset scores
        if (this.vrScoreUI) {
            this.updateVRScores();
        }
        
        // Broadcast the reset scores to all clients if we're the host
        if (this.engine.networkManager?.isHost) {
            playerIds.forEach(playerId => {
                this.engine.networkManager.broadcastScoreUpdate(playerId, 0);
            });
        }
        
        console.log('[SCORE] All scores have been reset');
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

    handleFullScoresSync(data) {
        if (!data || !data.scores || !Array.isArray(data.scores)) {
            console.error('[SCORE] Invalid full scores sync data:', data);
            return;
        }
        
        console.log('[SCORE] Processing full scores sync from host:', data);
        
        // Store all existing player IDs to handle players that might not be in the sync data
        const existingPlayerIds = new Set(this.scores.keys());
        const syncedPlayerIds = new Set();
        
        // Replace all scores with authoritative scores from host
        data.scores.forEach(playerData => {
            const { playerId, score } = playerData;
            
            if (!playerId) {
                console.warn('[SCORE] Skipping player with missing ID in sync data');
                return;
            }
            
            syncedPlayerIds.add(playerId);
            
            // Add player if needed
            if (!this.scores.has(playerId)) {
                console.log(`[SCORE] Adding new player ${playerId} from sync data`);
                this.addPlayer(playerId);
            }
            
            // Update score with authoritative host value
            const currentScore = this.scores.get(playerId);
            if (currentScore !== score) {
                console.log(`[SCORE] Sync updating Player ${playerId} score: ${currentScore} → ${score}`);
                this.scores.set(playerId, score);
            }
        });
        
        // Check for players that weren't in the sync data (optional - could be removed)
        existingPlayerIds.forEach(playerId => {
            if (!syncedPlayerIds.has(playerId)) {
                console.log(`[SCORE] Player ${playerId} not in sync data, keeping current score`);
            }
        });
        
        // Update UI once after processing all scores
        this.updateScoreDisplay();
        
        // Update VR Score UI with synced scores
        if (this.vrScoreUI) {
            console.log('[SCORE] Updating VR score display after score sync');
            this.updateVRScores();
        }
        
        console.log('[SCORE] Full scores sync completed');
    }
}

export { ScoreManager };
