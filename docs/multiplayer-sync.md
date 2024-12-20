# Multiplayer Synchronization Documentation

This document details how various game elements are synchronized across the network in the Target Shooting VR game.

## Network Message Types

All network messages follow this basic structure:
```javascript
{
    type: string,     // Message type identifier
    data?: any,       // Optional payload
    senderId: string  // ID of the sending player
}
```

## Game State Synchronization

### 1. Player Management

#### Player Join
- **Message Type:** `playerJoined`
- **Direction:** Server → All Clients
- **Data Structure:**
```javascript
{
    playerId: string,
    isHost: boolean
}
```
- **Handling:** 
  - Adds new player to PlayerManager's players Map
  - Updates UI to show new player
  - Host receives all existing players via initial connection

#### Player Leave
- **Message Type:** `playerLeft`
- **Direction:** Server → All Clients
- **Data Structure:**
```javascript
{
    playerId: string
}
```
- **Handling:**
  - Removes player from PlayerManager's players Map
  - Updates UI to remove player score
  - Cleans up any player-specific resources

### 2. Game Flow Control

#### Game Start
- **Message Type:** `gameStart`
- **Direction:** Host → Server → All Clients
- **Data Structure:**
```javascript
{
    startTime: number,  // Timestamp when game started
    duration: number    // Game duration in milliseconds
}
```
- **Handling:**
  - UIManager.handleNetworkGameStart()
  - Resets scores
  - Removes existing spheres
  - Starts timer
  - Shows/hides appropriate UI elements

#### Game End
- **Message Type:** `gameEnd`
- **Direction:** Host → Server → All Clients
- **Data Structure:** No additional data
- **Handling:**
  - UIManager.handleNetworkGameEnd()
  - Stops timer
  - Cleans up spheres
  - Shows final scores
  - Shows start button for host

### 3. Gameplay Elements

#### Sphere Spawning
- **Message Type:** `sphereSpawned`
- **Direction:** Host → Server → All Clients
- **Data Structure:**
```javascript
{
    id: string,
    position: { x: number, y: number, z: number },
    velocity: { x: number, y: number, z: number },
    color: number
}
```
- **Handling:**
  - SphereManager.handleNetworkSphereSpawn()
  - Creates identical sphere on all clients
  - Applies same physics properties

#### Sphere Hit
- **Message Type:** `sphereHit`
- **Direction:** Any Client → Server → All Clients
- **Data Structure:**
```javascript
{
    sphereId: string,
    playerId: string
}
```
- **Handling:**
  - SphereManager.handleNetworkSphereHit()
  - Removes sphere from game
  - Updates player score
  - Plays hit effects

### 4. Score System

#### Score Update
- **Message Type:** `scoreUpdate`
- **Direction:** Any Client → Server → All Clients
- **Data Structure:**
```javascript
{
    playerId: string,
    score: number
}
```
- **Handling:**
  - ScoreManager.handleNetworkScoreUpdate()
  - Updates local score map
  - Updates score display
  - Recalculates rankings

#### Score Reset
- **Message Type:** `scoreReset`
- **Direction:** Host → Server → All Clients
- **Data Structure:** No additional data
- **Handling:**
  - Clears all scores
  - Updates UI
  - Prepares for new game

## Implementation Guidelines

### Adding New Synchronized Elements

1. Define Message Structure:
```javascript
{
    type: 'newElementType',
    data: {
        // Element-specific data
    },
    senderId: playerId
}
```

2. Add Handler in NetworkManager:
```javascript
case 'newElementType':
    if (this.engine.relevantManager) {
        this.engine.relevantManager.handleNetworkNewElement(data);
    }
    break;
```

3. Implement Handler in Relevant Manager:
```javascript
handleNetworkNewElement(data) {
    // Validate data
    if (!this.validateNewElementData(data)) return;
    
    // Apply changes
    this.applyNetworkChanges(data);
    
    // Update UI if needed
    this.updateUI();
}
```

### Best Practices

1. **Message Validation**
   - Always validate incoming network messages
   - Check for required fields
   - Verify data types and ranges

2. **State Management**
   - Keep track of local vs. network state
   - Handle race conditions
   - Consider latency in timing-sensitive operations

3. **Error Handling**
   - Gracefully handle missing or invalid data
   - Log network-related errors
   - Implement recovery mechanisms

4. **Performance**
   - Minimize message size
   - Batch updates when possible
   - Consider message frequency

## Server Implementation

The server acts as a message relay and maintains:
- Connected clients list
- Host designation
- Message broadcasting

Key server functions:
```javascript
// Broadcast to all except sender
broadcast(message, sender) {
    clients.forEach(client => {
        if (client !== sender) {
            client.send(message);
        }
    });
}

// Broadcast to specific client
send(client, message) {
    client.send(JSON.stringify(message));
}
```

## Testing Network Features

1. Test with multiple clients
2. Verify message propagation
3. Check state consistency
4. Test disconnection handling
5. Verify host migration
6. Test latency handling

## Common Issues and Solutions

1. **Desynchronization**
   - Implement periodic state sync
   - Use host as source of truth
   - Add validation checks

2. **Message Loss**
   - Add acknowledgment system
   - Implement retry logic
   - Use reliable transport (WebSocket)

3. **Race Conditions**
   - Use timestamps
   - Implement message queuing
   - Add state reconciliation

4. **Performance**
   - Optimize message size
   - Batch updates
   - Use delta compression
