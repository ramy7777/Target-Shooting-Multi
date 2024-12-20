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
                
                this.ws.onmessage = (event) => this.handleMessage(event);
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

    handleMessage(event) {
        const data = JSON.parse(event.data);
        if (!data || !data.type) {
            console.error('[NETWORK] Received invalid message:', data);
            return;
        }

        console.log('[NETWORK] Received message:', data.type, 'from:', data.senderId);

        switch (data.type) {
            case 'init':
                this.localPlayerId = data.id;
                console.log('[NETWORK] Initialized with ID:', this.localPlayerId);
                break;
                
            case 'hostConfirm':
                this.currentRoom = data.roomCode;
                this.isHost = true;
                this.engine.playerManager.createLocalPlayer();
                
                if (data.players) {
                    data.players.forEach(player => {
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
                this.currentRoom = data.roomCode;
                this.isHost = false;
                this.engine.playerManager.createLocalPlayer();
                
                if (data.players) {
                    data.players.forEach(player => {
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
                if (data.id !== this.localPlayerId) {
                    this.engine.playerManager.addPlayer(data.id);
                }
                break;
                
            case 'playerLeft':
                if (!this.currentRoom) return;
                if (data.id !== this.localPlayerId) {
                    this.engine.playerManager.removePlayer(data.id);
                }
                break;
                
            case 'position':
                if (!this.currentRoom) return;
                if (data.id !== this.localPlayerId) {
                    this.engine.playerManager.updatePlayer(data.id, {
                        position: data.position,
                        headPosition: data.headPosition,
                        headRotation: data.headRotation,
                        controllers: data.controllers
                    });
                }
                break;

            case 'bulletSpawned':
                this.engine.bulletManager.handleNetworkBulletSpawn(data.data, data.senderId);
                break;

            case 'bulletHit':
                this.engine.bulletManager.handleNetworkBulletHit(data.data);
                break;

            case 'sphereSpawned':
                if (data.senderId !== this.localPlayerId) {
                    console.debug('[DEBUG] Received sphere spawn message:', data);
                    this.engine.sphereManager.handleNetworkSphereSpawn(data.data, data.senderId);
                }
                break;

            case 'sphereRemoved':
                this.engine.sphereManager.handleNetworkSphereRemoved(data.data);
                break;

            case 'birdSpawned':
                if (this.engine.birdManager) {
                    this.engine.birdManager.handleNetworkBirdSpawn(data.data);
                }
                break;

            case 'birdHit':
                if (this.engine.birdManager) {
                    this.engine.birdManager.handleNetworkBirdHit(data.data);
                }
                break;

            case 'gameStart':
                console.log('[NETWORK] Handling game start message');
                if (this.engine.uiManager) {
                    this.engine.uiManager.handleNetworkGameStart({
                        startTime: data.data.startTime,
                        duration: data.data.duration
                    });
                }
                break;

            case 'gameEnd':
                console.log('[NETWORK] Handling game end message');
                if (this.engine.uiManager) {
                    this.engine.uiManager.handleNetworkGameEnd();
                }
                break;

            case 'scoreReset':
                console.log('[NETWORK] Received score reset from:', data.senderId);
                if (this.engine.scoreManager) {
                    // Clear scores map
                    const playerIds = Array.from(this.engine.scoreManager.scores.keys());
                    this.engine.scoreManager.scores.clear();
                    
                    // Remove score displays from UI
                    if (this.engine.scoreManager.vrScoreUI) {
                        for (const playerId of playerIds) {
                            this.engine.scoreManager.vrScoreUI.removePlayer(playerId);
                        }
                    }
                }
                break;

            case 'voice_ready':
                this.engine.voiceManager.handleVoiceReady(data.playerId);
                break;
            
            case 'voice_offer':
                this.engine.voiceManager.handleVoiceOffer(data.playerId, data.offer);
                break;
            
            case 'voice_answer':
                this.engine.voiceManager.handleVoiceAnswer(data.playerId, data.answer);
                break;
            
            case 'voice_ice_candidate':
                this.engine.voiceManager.handleVoiceIceCandidate(data.playerId, data.candidate);
                break;
            
            case 'voice_stop':
                this.engine.voiceManager.handleVoiceStop(data.playerId);
                break;

            case 'error':
                console.error('Server error:', data.message);
                if (this.engine.sessionManager) {
                    this.engine.sessionManager.showError(data.message);
                }
                break;

            default:
                console.warn('[NETWORK] Unknown message type:', data.type);
        }
    }

    handleGameStart() {
        if (!this.isHost) {
            console.error('[NETWORK] Non-host client tried to start game');
            return;
        }

        const startTime = Date.now();
        const duration = 120000; // 120 seconds

        console.log('[NETWORK] Host starting game at:', startTime);

        // Send game start to all clients
        this.send({
            type: 'gameStart',
            data: {
                startTime: startTime,
                duration: duration
            },
            senderId: this.localPlayerId
        });

        // Start game locally for host
        if (this.engine.uiManager) {
            this.engine.uiManager.handleNetworkGameStart({
                startTime: startTime,
                duration: duration
            });
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
