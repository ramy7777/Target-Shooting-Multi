const https = require('https');
const fs = require('fs');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const ip = require('ip');

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS for remote debugging
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));

// Only use HTTPS in development
let server;
if (process.env.NODE_ENV === 'production') {
    server = require('http').createServer(app);
} else {
    // SSL certificates for HTTPS (required for WebXR in development)
    const options = {
        key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
        cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
    };
    server = https.createServer(options, app);
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

// Start server
server.listen(port, () => {
    console.log(`Server running at:`);
    console.log(`- Local: https://localhost:${port}`);
    console.log(`- Network: https://${ip.address()}:${port}`);
}).on('error', (error) => {
    console.error('Failed to start server:', error);
});
