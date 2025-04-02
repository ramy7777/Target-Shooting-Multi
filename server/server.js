const https = require('https');
const fs = require('fs');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const ip = require('ip');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS for all requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Proxy for Three.js modules
app.get('/three-proxy/*', async (req, res) => {
    try {
        const url = req.url.replace('/three-proxy/', '');
        const fullUrl = `https://unpkg.com/${url}`;
        
        console.log(`Proxying request to: ${fullUrl}`);
        
        const response = await fetch(fullUrl);
        
        // Set correct content type for JavaScript modules
        res.set('Content-Type', 'application/javascript; charset=utf-8');
        
        // Add proper CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        
        // Stream the response
        response.body.pipe(res);
    } catch (error) {
        console.error(`Proxy error: ${error.message}`);
        res.status(500).send(`Error fetching from unpkg: ${error.message}`);
    }
});

// Enhanced proxy specifically for Three.js modules
app.get('/three/*', async (req, res) => {
    try {
        // Check if file exists locally in node_modules first
        const localPath = path.join(__dirname, '../node_modules', req.url);
        if (fs.existsSync(localPath) && !fs.statSync(localPath).isDirectory()) {
            console.log(`Serving Three.js module from local path: ${localPath}`);
            return res.sendFile(localPath);
        }
        
        // If not found locally, proxy from unpkg
        const url = req.url.replace('/three/', 'three/');
        const fullUrl = `https://unpkg.com/${url}`;
        
        console.log(`Proxying Three.js module from: ${fullUrl}`);
        
        const response = await fetch(fullUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        
        // Set correct content type for JavaScript modules
        res.set('Content-Type', 'application/javascript; charset=utf-8');
        
        // Add proper CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        
        // Stream the response
        response.body.pipe(res);
    } catch (error) {
        console.error(`Three.js proxy error: ${error.message}`);
        res.status(500).send(`Error fetching Three.js module: ${error.message}`);
    }
});

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));

// Serve Three.js from node_modules
app.use('/three', (req, res, next) => {
    // Add CORS headers for Three.js module files
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}, express.static(path.join(__dirname, '../node_modules/three')));

// Only use HTTPS in development
let server;
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    console.log("Starting server in production mode with HTTP");
    server = require('http').createServer(app);
    
    // Additional production-specific configuration for Render.com
    if (process.env.RENDER) {
        console.log("Running on Render.com - Adding additional production configurations");
        
        // Set trust proxy to handle forwarded headers properly
        app.set('trust proxy', true);
        
        // Log request origin information for debugging
        app.use((req, res, next) => {
            console.log(`Request origin: ${req.get('origin') || 'No origin'}`);
            console.log(`Referer: ${req.get('referer') || 'No referer'}`);
            next();
        });
        
        // Add CORS headers for all responses in production
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.header('Access-Control-Max-Age', '86400'); // 24 hours
            
            // Handle preflight requests
            if (req.method === 'OPTIONS') {
                return res.status(204).end();
            }
            next();
        });
    }
} else {
    console.log("Starting server in development mode with HTTPS");
    try {
        // SSL certificates for HTTPS (required for WebXR in development)
        const options = {
            key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
            cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
        };
        server = https.createServer(options, app);
    } catch (error) {
        console.error("Error loading SSL certificates:", error);
        console.log("Falling back to HTTP server");
        server = require('http').createServer(app);
    }
}

const wss = new WebSocket.Server({ server });

// Store rooms and clients
const rooms = new Map(); // roomCode -> Set of clients
const clients = new Map(); // ws -> { id, roomCode, isHost }
let nextClientId = 1;

wss.on('connection', (ws) => {
    const clientId = nextClientId++;
    clients.set(ws, { id: clientId, roomCode: null, isHost: false });
    console.log(`Client ${clientId} connected`);

    // Send client their ID
    ws.send(JSON.stringify({
        type: 'init',
        id: clientId
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const client = clients.get(ws);

            switch (data.type) {
                case 'host':
                    handleHostSession(ws, client, data.roomCode);
                    break;

                case 'join':
                    handleJoinSession(ws, client, data.roomCode);
                    break;

                case 'autoJoin':
                    handleAutoJoin(ws, client);
                    break;

                case 'position':
                case 'interaction':
                    // Forward updates only to clients in the same room
                    broadcastToRoom(client.roomCode, {
                        ...data,
                        id: client.id
                    }, ws);
                    break;

                case 'bulletSpawned':
                    broadcastToRoom(client.roomCode, {
                        type: 'bulletSpawned',
                        senderId: client.id,
                        data: data.data
                    }, ws);
                    break;

                case 'birdSpawned':
                    broadcastToRoom(client.roomCode, {
                        type: 'birdSpawned',
                        senderId: client.id,
                        data: data.data
                    }, ws);
                    break;

                case 'birdHitAttempt':
                    // Only process hit attempts if they come from a client
                    const room = rooms.get(client.roomCode);
                    if (room) {
                        // Find the host of the room
                        const host = Array.from(room).find(clientWs => {
                            const clientData = clients.get(clientWs);
                            return clientData && clientData.isHost;
                        });

                        if (host) {
                            // Forward the hit attempt to the host for validation
                            host.send(JSON.stringify({
                                type: 'birdHitAttempt',
                                senderId: client.id,
                                data: data.data
                            }));
                        }
                    }
                    break;

                case 'birdHit':
                    // Only process confirmed hits from the host
                    const clientData = clients.get(ws);
                    if (clientData && clientData.isHost) {
                        broadcastToRoom(client.roomCode, {
                            type: 'birdHit',
                            senderId: client.id,
                            data: data.data
                        }, null); // Send to all clients including sender
                    }
                    break;

                case 'birdRemoved':
                    broadcastToRoom(client.roomCode, {
                        type: 'birdRemoved',
                        senderId: client.id,
                        data: data.data
                    }, ws);
                    break;

                case 'sphereSpawned':
                    broadcastToRoom(client.roomCode, {
                        type: 'sphereSpawned',
                        senderId: client.id,
                        data: data.data
                    }, ws);
                    break;

                case 'sphereRemoved':
                    broadcastToRoom(client.roomCode, {
                        type: 'sphereRemoved',
                        senderId: client.id,
                        data: data.data
                    }, ws);
                    break;

                case 'timerSync':
                    // Forward timer sync to all clients in the room except sender
                    broadcastToRoom(client.roomCode, {
                        type: 'timerSync',
                        senderId: client.id,
                        data: data.data
                    }, ws);
                    break;

                case 'birdKilled':
                    broadcastToRoom(client.roomCode, {
                        type: 'birdKilled',
                        senderId: client.id,
                        data: data.data
                    }, ws);
                    break;

                case 'scoreUpdate':
                    // Store the score with the client data
                    if (clients.get(ws)) {
                        clients.get(ws).score = data.data.score;
                    }
                    // Broadcast score update to all clients
                    broadcastToRoom(client.roomCode, {
                        type: 'scoreUpdate',
                        senderId: client.id,
                        data: data.data
                    }, null); // Include sender to ensure confirmation
                    break;

                // Voice chat signaling
                case 'voice_ready':
                case 'voice_offer':
                case 'voice_answer':
                case 'voice_ice_candidate':
                case 'voice_stop':
                    console.log(`Voice ${data.type} from ${client.id} in room ${client.roomCode}`);
                    
                    // Forward to specific target if specified, otherwise broadcast to room
                    if (data.targetId) {
                        // Find target client's websocket
                        for (const [targetWs, targetClient] of clients.entries()) {
                            if (targetClient.id === data.targetId && targetClient.roomCode === client.roomCode) {
                                console.log(`Forwarding ${data.type} to player ${data.targetId}`);
                                targetWs.send(JSON.stringify({
                                    ...data,
                                    playerId: client.id
                                }));
                                break;
                            }
                        }
                    } else {
                        console.log(`Broadcasting ${data.type} to room ${client.roomCode}`);
                        broadcastToRoom(client.roomCode, {
                            ...data,
                            playerId: client.id
                        }, ws);
                    }
                    break;
            }
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    });

    ws.on('close', () => {
        const client = clients.get(ws);
        console.log(`Client ${client.id} disconnected`);
        
        // Remove from room if in one
        if (client.roomCode) {
            const room = rooms.get(client.roomCode);
            if (room) {
                room.delete(ws);
                // Notify others in room
                broadcastToRoom(client.roomCode, {
                    type: 'playerLeft',
                    id: client.id
                });
                // Delete room if empty
                if (room.size === 0) {
                    rooms.delete(client.roomCode);
                    console.log(`Room ${client.roomCode} deleted`);
                }
            }
        }
        
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        const client = clients.get(ws);
        console.error(`WebSocket error for client ${client.id}:`, error);
    });
});

function handleHostSession(ws, client, roomCode) {
    // Create new room
    if (!rooms.has(roomCode)) {
        rooms.set(roomCode, new Set([ws]));
        client.roomCode = roomCode;
        client.isHost = true;
        console.log(`Room ${roomCode} created by client ${client.id}`);
        
        ws.send(JSON.stringify({
            type: 'hostConfirm',
            roomCode
        }));
    } else {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room already exists'
        }));
    }
}

function handleJoinSession(ws, client, roomCode) {
    const room = rooms.get(roomCode);
    if (room) {
        // Join room
        room.add(ws);
        client.roomCode = roomCode;
        console.log(`Client ${client.id} joined room ${roomCode}`);

        // Send confirmation
        ws.send(JSON.stringify({
            type: 'joinConfirm',
            roomCode
        }));

        // Send existing players to new client
        room.forEach(existingClient => {
            if (existingClient !== ws) {
                const existingClientData = clients.get(existingClient);
                ws.send(JSON.stringify({
                    type: 'playerJoined',
                    id: existingClientData.id
                }));
                
                // If we have score data for this player, send it to the new client
                if (existingClientData.score !== undefined) {
                    ws.send(JSON.stringify({
                        type: 'scoreUpdate',
                        senderId: existingClientData.id,
                        data: {
                            playerId: existingClientData.id,
                            score: existingClientData.score
                        }
                    }));
                }
            }
        });

        // Notify others in room
        broadcastToRoom(roomCode, {
            type: 'playerJoined',
            id: client.id
        }, ws);
    } else {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room not found'
        }));
    }
}

function handleAutoJoin(ws, client) {
    console.log(`Client ${client.id} requesting auto-join`);
    
    // Find an existing room with space or create a new one
    let targetRoom = null;
    let targetRoomCode = null;

    // Try to find an existing room with space
    console.log('Looking for available rooms...');
    for (const [roomCode, room] of rooms.entries()) {
        console.log(`Checking room ${roomCode}: ${room.size} players`);
        if (room.size < 4) { // Maximum 4 players per room
            targetRoom = room;
            targetRoomCode = roomCode;
            console.log(`Found suitable room: ${roomCode}`);
            break;
        }
    }

    // If no suitable room found, create a new one
    if (!targetRoom) {
        targetRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        targetRoom = new Set();
        rooms.set(targetRoomCode, targetRoom);
        console.log(`Created new room: ${targetRoomCode}`);
    }

    // Add client to room
    targetRoom.add(ws);
    client.roomCode = targetRoomCode;
    console.log(`Added client ${client.id} to room ${targetRoomCode}`);

    // Get current players in the room
    const currentPlayers = Array.from(targetRoom)
        .filter(playerWs => playerWs !== ws) // Exclude the joining player
        .map(playerWs => {
            const playerClient = clients.get(playerWs);
            return {
                id: playerClient.id,
                position: playerClient.position,
                headPosition: playerClient.headPosition,
                headRotation: playerClient.headRotation,
                controllers: playerClient.controllers
            };
        });

    console.log(`Current players in room: ${currentPlayers.map(p => p.id).join(', ') || 'none'}`);

    // Send confirmation to the client
    const confirmMessage = {
        type: 'autoJoinConfirm',
        roomCode: targetRoomCode,
        players: currentPlayers
    };
    console.log('Sending autoJoinConfirm:', confirmMessage);
    ws.send(JSON.stringify(confirmMessage));

    // Send existing player scores to the new client
    targetRoom.forEach(existingClient => {
        if (existingClient !== ws) {
            const existingClientData = clients.get(existingClient);
            if (existingClientData.score !== undefined) {
                ws.send(JSON.stringify({
                    type: 'scoreUpdate',
                    senderId: existingClientData.id,
                    data: {
                        playerId: existingClientData.id,
                        score: existingClientData.score
                    }
                }));
            }
        }
    });

    // Notify other clients in the room
    broadcastToRoom(targetRoomCode, {
        type: 'playerJoined',
        id: client.id
    }, ws);

    console.log(`Client ${client.id} auto-joined room ${targetRoomCode}`);
}

function broadcastToRoom(roomCode, message, exclude = null) {
    const room = rooms.get(roomCode);
    if (room) {
        const messageStr = JSON.stringify(message);
        room.forEach(client => {
            if (client !== exclude && client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }
}

// Start the server
server.listen(port, () => {
    const localUrl = `${process.env.NODE_ENV === 'production' || process.env.RENDER ? 'http' : 'https'}://localhost:${port}`;
    const networkUrl = `${process.env.NODE_ENV === 'production' || process.env.RENDER ? 'http' : 'https'}://${ip.address()}:${port}`;
    
    console.log('Server running at:');
    
    if (!process.env.RENDER) {
        // Only show local URL in non-render environments
        console.log(`- Local: ${localUrl}`);
    }
    
    if (process.env.RENDER) {
        console.log(`- Deployed on Render.com`);
    } else {
        console.log(`- Network: ${networkUrl}`);
    }
});
