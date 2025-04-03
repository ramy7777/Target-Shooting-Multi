import * as THREE from 'three';
import { Bullet } from '../entities/Bullet.js';

export class NetworkManager {
    constructor(engine) {
        this.engine = engine;
        this.players = new Map();
        this.localPlayerId = null;
        this.lastUpdateTime = 0;
        this.updateInterval = 50; // Send updates every 50ms
        this.connected = false;
        this.ws = null;
        this.onConnect = null; // Callback for when connection is established
        this.currentRoom = null; // Track current room
        this.isHost = false; // Track if this client is the host
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second delay
    }

    async connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('[NETWORK] Already connected');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                this.ws = new WebSocket(`${protocol}//${window.location.host}`);

                this.ws.onopen = () => {
                    console.log('[NETWORK] Connected successfully');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    if (this.onConnect) {
                        this.onConnect();
                    }
                    resolve();
                };
                
                this.ws.onclose = () => {
                    console.log('[NETWORK] Connection closed');
                    this.connected = false;
                    this.currentRoom = null; // Clear room on disconnect
                    this.clearPlayers(); // Clear all players on disconnect
                    this.attemptReconnect();
                };
                
                this.ws.onerror = (error) => {
                    console.error('[NETWORK] WebSocket error:', error);
                    this.connected = false;
                    reject(error);
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('[NETWORK] Error parsing message:', error, event.data);
                    }
                };
            } catch (error) {
                console.error('[NETWORK] Failed to connect:', error);
                reject(error);
            }
        });
    }

    disconnect() {
        if (this.ws) {
            if (this.currentRoom) {
                // Send leave message before disconnecting
                this.send({
                    type: 'leave',
                    roomCode: this.currentRoom
                });
            }
            this.ws.close();
            this.ws = null;
            this.connected = false;
            this.currentRoom = null;
            this.clearPlayers();
        }
    }

    clearPlayers() {
        // Remove all players except local
        for (const [id, player] of this.players) {
            if (id !== this.localPlayerId) {
                this.engine.playerManager.removePlayer(id);
            }
        }
        this.players.clear();
    }

    handleMessage(message) {
        // Log received messages (excluding position updates to reduce spam)
        if (message.type !== 'birdPositionSync') {
            console.log(`[NETWORK] Received message: ${message.type}`, message.data);
        }

        // Process the message based on type
        switch (message.type) {
            case 'birdSpawned':
                console.log('[NETWORK] Bird spawn message received');
                if (this.engine.birdManager) {
                    // Call with HIGH PRIORITY to ensure proper synchronization
                    setTimeout(() => {
                        this.engine.birdManager.handleNetworkBirdSpawn(message.data);
                    }, 0);  // Using setTimeout with 0ms for immediate async execution
                }
                break;

            case 'birdHit':
                // CRITICAL PRIORITY - Process immediately
                console.log('[NETWORK] Bird hit confirmed by server:', message.data.birdId);
                
                // Special handling for host messages
                const isHostSelfMessage = this.isHost && message.data.bulletShooterId === this.localPlayerId;
                
                if (isHostSelfMessage) {
                    console.log('[NETWORK] Host skipping processing of own hit to avoid duplicate effects');
                } else if (this.engine.birdManager) {
                    // Process normally for non-host or other player hits
                    this.engine.birdManager.handleNetworkBirdHit(message.data);
                }
                break;

            case 'birdHitAttempt':
                // Host validation of bullet hit
                if (this.isHost && this.engine.birdManager) {
                    console.log('[NETWORK] Host processing bird hit attempt');
                    // Validate hit (just accepting for now, could add more validation)
                    const { birdId, bulletShooterId, position } = message.data;
                    
                    // Broadcast confirmed hit to all players
                    this.send({
                        type: 'birdHit',
                        data: {
                            birdId,
                            bulletShooterId,
                            position,
                            points: 10
                        }
                    });
                    
                    // Update points for shooter
                    if (this.engine.scoreManager) {
                        this.engine.scoreManager.updateScore(bulletShooterId, 10);
                        // Broadcast the updated score
                        const score = this.engine.scoreManager.scores.get(bulletShooterId) || 0;
                        this.broadcastScoreUpdate(bulletShooterId, score);
                    }
                }
                break;

            case 'init':
                this.localPlayerId = message.id;
                console.log('[NETWORK] Initialized with ID:', this.localPlayerId);
                break;
                
            case 'hostConfirm':
                this.currentRoom = message.roomCode;
                this.isHost = true;
                this.engine.playerManager.createLocalPlayer();
                
                if (message.players) {
                    message.players.forEach(player => {
                        if (player.id !== this.localPlayerId) {
                            this.engine.playerManager.addPlayer(player.id);
                            if (player.position) {
                                this.engine.playerManager.updatePlayer(player.id, {
                                    position: player.position,
                                    headPosition: player.headPosition,
                                    headRotation: player.headRotation,
                                    controllers: player.controllers
                                });
                            }
                        }
                    });
                }
                break;
                
            case 'joinConfirm':
            case 'autoJoinConfirm':
                this.currentRoom = message.roomCode;
                this.isHost = false;
                this.engine.playerManager.createLocalPlayer();
                
                if (message.players) {
                    message.players.forEach(player => {
                        if (player.id !== this.localPlayerId) {
                            this.engine.playerManager.addPlayer(player.id);
                            if (player.position) {
                                this.engine.playerManager.updatePlayer(player.id, {
                                    position: player.position,
                                    headPosition: player.headPosition,
                                    headRotation: player.headRotation,
                                    controllers: player.controllers
                                });
                            }
                        }
                    });
                }
                break;
                
            case 'playerJoined':
                if (!this.currentRoom) return;
                if (message.id !== this.localPlayerId) {
                    this.engine.playerManager.addPlayer(message.id);
                }
                break;
                
            case 'playerLeft':
                if (!this.currentRoom) return;
                if (message.id !== this.localPlayerId) {
                    this.engine.playerManager.removePlayer(message.id);
                }
                break;
                
            case 'position':
                if (!this.currentRoom) return;
                if (message.id !== this.localPlayerId) {
                    this.engine.playerManager.updatePlayer(message.id, {
                        position: message.position,
                        headPosition: message.headPosition,
                        headRotation: message.headRotation,
                        controllers: message.controllers
                    });
                }
                break;

            case 'bulletSpawned':
                this.engine.bulletManager.handleNetworkBulletSpawn(message.data, message.senderId);
                break;

            case 'bulletHit':
                this.engine.bulletManager.handleNetworkBulletHit(message.data);
                break;

            case 'sphereSpawned':
                if (message.senderId !== this.localPlayerId) {
                    console.debug('[DEBUG] Received sphere spawn message:', message);
                    this.engine.sphereManager.handleNetworkSphereSpawn(message.data, message.senderId);
                }
                break;

            case 'sphereRemoved':
                this.engine.sphereManager.handleNetworkSphereRemoved(message.data);
                break;

            case 'birdRemoved':
                if (this.engine.birdManager) {
                    console.log('[NETWORK] Processing bird removal message for bird:', message.data.id);
                    this.engine.birdManager.handleNetworkBirdRemoved(message.data);
                }
                break;

            case 'gameStart':
                if (!this.isHost) {
                    console.log('[NETWORK] Client received game start:', message);
                    if (!message.data || !message.data.startTime || !message.data.duration) {
                        console.error('[NETWORK] Invalid game start data:', message);
                        return;
                    }
                    
                    // Reset scores when new game starts
                    if (this.engine.scoreManager) {
                        console.log('[NETWORK] Resetting scores for new game');
                        this.engine.scoreManager.resetScores();
                    }
                    
                    // Cleanup any existing birds
                    if (this.engine.birdManager) {
                        console.log('[NETWORK] Cleaning up existing birds for new game');
                        
                        // Store a copy of all bird IDs
                        const birdIds = Array.from(this.engine.birdManager.birds.keys());
                        
                        // Remove all existing birds
                        birdIds.forEach(id => {
                            this.engine.birdManager.removeBird(id);
                        });
                    }
                    
                    this.engine.uiManager.handleNetworkGameStart(message.data);
                }
                break;

            case 'gameEnd':
                console.log('[NETWORK] Received game end message from:', message.senderId);
                if (this.engine.uiManager) {
                    this.engine.uiManager.handleNetworkGameEnd();
                } else {
                    console.error('[NETWORK] UIManager not found for game end');
                }
                break;

            case 'voice_ready':
                this.engine.voiceManager.handleVoiceReady(message.playerId);
                break;
            
            case 'voice_offer':
                this.engine.voiceManager.handleVoiceOffer(message.playerId, message.offer);
                break;
            
            case 'voice_answer':
                this.engine.voiceManager.handleVoiceAnswer(message.playerId, message.answer);
                break;
            
            case 'voice_ice_candidate':
                this.engine.voiceManager.handleVoiceIceCandidate(message.playerId, message.candidate);
                break;
            
            case 'voice_stop':
                this.engine.voiceManager.handleVoiceStop(message.playerId);
                break;

            case 'scoreUpdate':
                if (this.engine.scoreManager) {
                    console.log('[NETWORK] Received score update:', message);
                    
                    // Force add the player if they don't exist in our score list yet
                    if (!this.engine.scoreManager.scores.has(message.data.playerId)) {
                        this.engine.scoreManager.addPlayer(message.data.playerId);
                        console.log(`[NETWORK] Added new player ${message.data.playerId} to score table`);
                    }
                    
                    // Update the score
                    this.engine.scoreManager.handleNetworkScoreUpdate(message.data);
                    
                    // If we're the host, make sure the score gets broadcast to all clients
                    if (this.isHost && message.senderId !== this.localPlayerId) {
                        console.log('[NETWORK] Host relaying score update to all clients');
                        this.broadcastScoreUpdate(message.data.playerId, message.data.score);
                    }
                }
                break;

            case 'timerSync':
                console.log('[NETWORK] Received timer sync from host:', message.data);
                if (this.engine.uiManager) {
                    this.engine.uiManager.handleTimerSync(message.data);
                } else {
                    console.error('[NETWORK] UIManager not found for timer sync');
                }
                break;

            case 'error':
                console.error('Server error:', message.message);
                if (this.engine.sessionManager) {
                    this.engine.sessionManager.showError(message.message);
                }
                break;

            case 'birdPositionSync':
                // Handle bird position synchronization from host
                if (this.engine.birdManager) {
                    console.log(`[NETWORK] Received position sync for ${message.data.birds.length} birds`);
                    this.engine.birdManager.handleBirdPositionSync(message.data);
                }
                break;

            default:
                console.warn('[NETWORK] Unknown message type:', message.type);
        }
    }

    handleGameStart() {
        if (!this.isHost) {
            console.error('[NETWORK] Non-host client tried to start game');
            return;
        }

        console.log('[NETWORK] Host starting game...');
        
        // First, ensure any existing game state is cleaned up
        this.engine.uiManager.stopTimer();
        
        // Start game locally for host
        this.engine.uiManager.handleGameStart();

        // Wait for game to be fully initialized
        const checkInitialization = () => {
            if (this.engine.uiManager.gameStarted && this.engine.uiManager.timerInterval) {
                // Game is fully initialized, send start message to clients
                const currentTime = Date.now();
                const startData = {
                    startTime: this.engine.uiManager.gameStartTime,
                    duration: this.engine.uiManager.gameDuration,
                    currentTime: currentTime
                };
                console.log('[NETWORK] Game initialized, sending start to clients:', startData);
                this.send({
                    type: 'gameStart',
                    data: startData
                });
                
                // Immediately send a timer sync as well
                this.send({
                    type: 'timerSync',
                    data: {
                        currentTime: currentTime,
                        gameStartTime: this.engine.uiManager.gameStartTime,
                        gameDuration: this.engine.uiManager.gameDuration,
                        gameTime: 0,
                        remainingTime: this.engine.uiManager.gameDuration
                    }
                });
            } else if (this.engine.uiManager.gameStarted) {
                // Game started but not fully initialized, wait a bit longer
                console.log('[NETWORK] Waiting for game initialization...');
                setTimeout(checkInitialization, 50);
            } else {
                console.error('[NETWORK] Game failed to start');
            }
        };

        // Start checking initialization after a short delay
        setTimeout(checkInitialization, 50);
    }

    // Broadcast score update to all clients
    broadcastScoreUpdate(playerId, score) {
        if (!this.connected || !this.currentRoom) return;
        
        console.log(`[NETWORK] Broadcasting score update: Player ${playerId} = ${score}`);
        
        // Always send score update to all clients
        this.send({
            type: 'scoreUpdate',
            data: {
                playerId: playerId,
                score: score
            }
        });
        
        // Make sure our local score display is updated too
        if (this.engine.scoreManager) {
            // First add the player if needed
            if (!this.engine.scoreManager.scores.has(playerId)) {
                this.engine.scoreManager.addPlayer(playerId);
            }
            
            // Update the score directly to avoid broadcast loops
            console.log(`[NETWORK] Setting local score: Player ${playerId} = ${score}`);
            this.engine.scoreManager.scores.set(playerId, score);
            this.engine.scoreManager.updateScoreDisplay();
            
            // Update VR scores if available
            if (this.engine.scoreManager.vrScoreUI) {
                this.engine.scoreManager.updateVRScores();
            }
        }
    }

    async autoJoinRoom() {
        try {
            if (!this.connected) {
                await this.connect();
            }
            
            // Return a promise that resolves when we receive the autoJoinConfirm
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Auto join timed out'));
                }, 5000);

                const checkAutoJoin = (event) => {
                    const message = JSON.parse(event.data);
                    if (message.type === 'autoJoinConfirm') {
                        clearTimeout(timeout);
                        this.ws.removeEventListener('message', checkAutoJoin);
                        this.currentRoom = message.roomCode;
                        resolve(message);
                    }
                };

                this.ws.addEventListener('message', checkAutoJoin);
                
                this.send({
                    type: 'autoJoin'
                });
            });
        } catch (error) {
            console.error('Failed to auto join:', error);
            throw error;
        }
    }

    async hostRoom() {
        if (!this.connected) {
            await this.connect();
        }

        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.send({
            type: 'host',
            roomCode: roomCode
        });
    }

    async joinRoom(roomCode) {
        if (!this.connected) {
            await this.connect();
        }

        this.send({
            type: 'join',
            roomCode: roomCode
        });
    }

    update(delta) {
        if (!this.connected || !this.currentRoom || !this.engine.playerManager.localPlayer) return;

        const now = performance.now();
        if (now - this.lastUpdateTime > this.updateInterval) {
            this.lastUpdateTime = now;
            this.sendPlayerUpdate();
        }
    }

    sendPlayerUpdate() {
        const player = this.engine.playerManager.localPlayer;
        if (!this.connected || !this.currentRoom || !player || !player.mesh) return;

        // Get the network update from the player which includes all necessary data
        const playerData = player.getNetworkUpdate();
        
        const update = {
            type: 'position',
            roomCode: this.currentRoom,
            id: this.localPlayerId,
            position: playerData.position,
            headPosition: playerData.headPosition,
            headRotation: playerData.headRotation,
            controllers: playerData.controllers
        };
        
        this.send(update);
    }

    send(data) {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('[NETWORK] Cannot send message - socket not connected. Attempting to reconnect...');
            this.connect().catch(error => {
                console.error('[NETWORK] Reconnection failed:', error);
            });
            return;
        }

        // Ensure message has a senderId
        data.senderId = data.senderId || this.localPlayerId;
        
        try {
            console.log('[NETWORK] Sending message:', data);
            this.ws.send(JSON.stringify(data));
        } catch (error) {
            console.error('[NETWORK] Error sending message:', error);
            // Try to reconnect on send error
            this.connect().catch(error => {
                console.error('[NETWORK] Reconnection failed:', error);
            });
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[NETWORK] Max reconnection attempts reached');
            return;
        }

        console.log(`[NETWORK] Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        setTimeout(() => {
            this.reconnectAttempts++;
            this.connect().catch(error => {
                console.error('[NETWORK] Reconnection attempt failed:', error);
                // Exponential backoff
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
            });
        }, this.reconnectDelay);
    }
}
