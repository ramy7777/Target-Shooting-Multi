import * as THREE from 'three';
import { Bird } from '../entities/Bird.js';

export class BirdManager {
    constructor(engine) {
        this.engine = engine;
        this.birds = new Map();
        this.lastSpawnTime = 0;
        this.spawnInterval = 5000; // 5 seconds between spawns
        this.maxBirds = 6; // Maximum number of birds allowed (reduced from 10)
        this.isSpawning = false; // Will be set to true when startSpawning is called
        this._lastRemovedBirdIdByNetwork = null;
        this.lastHostHitData = null; // Track last hit processed by host to prevent duplicates
        
        // Enable debug visualization
        this.debug = false; // Set to false to hide bounding boxes
        
        // Track time for position synchronization
        this.lastSyncTime = 0;
        this.syncInterval = 500; // Sync positions every 500ms
        this.timeOffset = 0; // Time difference between local and host

        // Get room dimensions from the platform size
        const platform = this.engine.world?.ground;
        let platformDimensions;
        if (platform) {
            const boundingBox = new THREE.Box3().setFromObject(platform);
            const size = boundingBox.getSize(new THREE.Vector3());
            platformDimensions = {
                width: size.x,
                depth: size.z,
                y: platform.position.y // Use the platform's y position
            };
            console.log('[BIRD] Platform dimensions:', platformDimensions);
        } else {
            // Fallback dimensions if platform not loaded
            platformDimensions = {
                width: 10,
                depth: 10,
                y: 0.5
            };
            console.warn('[BIRD] Platform not found, using fallback dimensions');
        }

        // Calculate spawn boundaries to be directly above the platform with smaller inset
        const insetPercentage = 0.1; // 10% inset from platform edges
        const heightOffset = 0.5; // How high above the platform to start spawning
        const spawnHeight = 1.5; // How tall the spawn area should be

        // Calculate a spawn area that's 3x smaller than before
        this.spawnBoundary = {
            minX: -(platformDimensions.width / 36), // 3x smaller (was 1/12)
            maxX: (platformDimensions.width / 36),  // 3x smaller (was 1/12)
            minY: platformDimensions.y + heightOffset, 
            maxY: platformDimensions.y + heightOffset + spawnHeight,
            minZ: -(platformDimensions.depth / 36), // 3x smaller (was 1/12)
            maxZ: (platformDimensions.depth / 36)   // 3x smaller (was 1/12)
        };
        
        console.log('[BIRD] Spawn boundaries (9x smaller):', this.spawnBoundary);

        // Start spawning birds automatically when BirdManager is created
        // This ensures birds start spawning immediately for testing
        if (engine && engine.networkManager) {
            // Wait for network manager to be ready
            setTimeout(() => {
                this.startSpawning();
                console.log('[BIRD] Auto-starting bird spawning');
            }, 2000);
        }
    }

    update(delta) {
        if (!this.isSpawning) return;

        const currentTime = Date.now();

        // Only host spawns birds
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            if (currentTime - this.lastSpawnTime > this.spawnInterval && this.birds.size < this.maxBirds) {
                console.log(`[BIRD] Time to spawn balls. Current count: ${this.birds.size}, Max: ${this.maxBirds}`);
                const birdsToSpawn = Math.min(2, this.maxBirds - this.birds.size); // Spawn 2 birds at a time
                for (let i = 0; i < birdsToSpawn; i++) {
                    this.spawnBird();
                }
                this.lastSpawnTime = currentTime;
                console.log(`[BIRD] After spawning, new count: ${this.birds.size}`);
            }
            
            // Host periodically sends position updates to clients
            if (currentTime - this.lastSyncTime > this.syncInterval && this.birds.size > 0) {
                this.syncBirdPositions();
                this.lastSyncTime = currentTime;
            }
        }

        // Update all birds
        for (const [id, bird] of this.birds) {
            try {
                if (bird.update(delta)) {
                    this.removeBird(id);
                    console.log(`[BIRD] Ball ${id} expired naturally, removing`);
                }
                
                // Update boxHelper position if it exists
                if (this.debug && bird.boxHelper) {
                    bird.boxHelper.update();
                }
            } catch (error) {
                console.error(`[BIRD] Error updating ball ${id}:`, error);
                this.removeBird(id);
            }
        }
        
        // Periodically verify all balls are in the scene
        if (currentTime % 30000 < 20) { // Every ~30 seconds
            this.verifyBallsInScene();
        }
    }

    verifyBallsInScene() {
        console.log(`[BIRD] Verifying ${this.birds.size} balls in scene:`);
        let visibleCount = 0;
        
        for (const [id, bird] of this.birds) {
            // Check if the bird is in the scene
            const isInScene = this.engine.scene.children.includes(bird);
            const hasChildren = bird.children.length > 0;
            const isVisible = bird.visible;
            
            if (isVisible) visibleCount++;
            
            console.log(`[BIRD] Ball ${id.substring(0,6)}: in scene=${isInScene}, children=${hasChildren}, visible=${isVisible}, pos=${bird.position.toArray().map(v => v.toFixed(2))}`);
            
            // If not in scene, add it back
            if (!isInScene) {
                console.warn(`[BIRD] Ball ${id} not in scene, adding back`);
                this.engine.scene.add(bird);
                bird.visible = true;
            }
        }
        
        console.log(`[BIRD] Visible balls: ${visibleCount}/${this.birds.size}`);
    }

    syncBirdPositions() {
        // Only the host should sync positions
        if (!this.engine.networkManager?.isHost) return;
        
        // Prepare position data for all birds
        const positionData = [];
        for (const [id, bird] of this.birds) {
            positionData.push({
                id: id,
                position: bird.position.toArray(),
                serverTime: Date.now() // Include server time for synchronization
            });
        }
        
        // Send position data to all clients
        if (positionData.length > 0) {
            console.log(`[BIRD] Host sending position sync for ${positionData.length} birds`);
            this.engine.networkManager.send({
                type: 'birdPositionSync',
                data: {
                    birds: positionData
                }
            });
        }
    }

    // Handle receiving position sync from host
    handleBirdPositionSync(data) {
        if (this.engine.networkManager?.isHost) return; // Host doesn't need sync
        
        // Calculate time offset from server if first sync
        if (this.timeOffset === 0 && data.birds.length > 0) {
            const serverTime = data.birds[0].serverTime;
            this.timeOffset = Date.now() - serverTime;
            console.log(`[BIRD] Setting time offset: ${this.timeOffset}ms`);
        }
        
        // Update bird positions
        for (const birdData of data.birds) {
            const bird = this.birds.get(birdData.id);
            if (bird) {
                // Get host position
                const hostPosition = new THREE.Vector3().fromArray(birdData.position);
                
                // Only make major corrections to avoid jitter
                const distance = bird.position.distanceTo(hostPosition);
                
                if (distance > 0.25) { // Only correct if more than 0.25 units off
                    console.log(`[BIRD] Correcting bird ${birdData.id} position (distance: ${distance.toFixed(3)})`);
                    // Smoothly move towards host position
                    bird.position.lerp(hostPosition, 0.5);
                }
            }
        }
    }

    spawnBird() {
        // Generate a position within the spawn boundary
        const x = THREE.MathUtils.randFloat(this.spawnBoundary.minX, this.spawnBoundary.maxX);
        const y = THREE.MathUtils.randFloat(this.spawnBoundary.minY, this.spawnBoundary.maxY);
        const z = THREE.MathUtils.randFloat(this.spawnBoundary.minZ, this.spawnBoundary.maxZ);

        const position = new THREE.Vector3(x, y, z);
        const direction = new THREE.Vector3(1, 0, 0);

        // Generate movement pattern data to share across network
        const movementData = {
            speed: THREE.MathUtils.randFloat(0.3, 0.6),
            patternType: Math.floor(Math.random() * 3),
            patternScale: THREE.MathUtils.randFloat(0.5, 1.5),
            patternPhase: Math.random() * Math.PI * 2,
            timeOffset: Math.random() * 1000,
            directionX: THREE.MathUtils.randFloatSpread(0.5),
            directionZ: THREE.MathUtils.randFloatSpread(0.5)
        };

        // Use server time for spawning
        const serverTime = Date.now();

        // Create bird with movement data
        console.log('[BIRD] Spawning bird at position:', position.toArray());
        const bird = new Bird(position, direction, movementData);
        bird.spawnTime = serverTime; // Use exact server time
        bird.birdManager = this;
        bird.visible = true; // Ensure visibility
        
        // Check bird has meshes
        console.log('[BIRD] Bird has children:', bird.children.length);
        
        // Store in birds map
        this.birds.set(bird.uuid, bird);
        
        // Add to scene
        this.engine.scene.add(bird);
        console.log('[BIRD] Ball added to scene with ID:', bird.uuid);

        // Create the visual bounding box helper for debugging
        if (this.debug) {
            const boxHelper = new THREE.BoxHelper(bird, 0xffff00);
            this.engine.scene.add(boxHelper);
            bird.boxHelper = boxHelper;
            console.log('[BIRD] Added debug box helper');
        }

        // Play spawn sound - synchronize over network
        const playSpawnSound = () => {
            if (this.engine.audioManager) {
                this.engine.audioManager.playBirdSpawn();
                console.log('[BIRD] Played spawn sound for new ball');
            } else {
                console.warn('[BIRD] AudioManager not available for spawn sound!');
            }
        };
        
        // Always play sound locally
        playSpawnSound();

        // Network the spawn if we're the host
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            console.log('[BIRD] Broadcasting ball spawn to network');
            this.engine.networkManager.send({
                type: 'birdSpawned',
                data: {
                    id: bird.uuid,
                    position: position.toArray(),
                    direction: direction.toArray(),
                    spawnTime: serverTime, // Use exact server time
                    playSound: true,
                    movementData: movementData  // Include movement pattern data
                }
            });
        }

        return bird;
    }

    removeBird(id) {
        if (this.birds.has(id)) {
            const bird = this.birds.get(id);
            
            // Remove from scene
            this.engine.scene.remove(bird);
            
            // Remove any visual helpers
            if (bird.boxHelper) {
                this.engine.scene.remove(bird.boxHelper);
            }
            
            // Clean up geometry and material to prevent memory leaks
            if (bird.mesh && bird.mesh.geometry) {
                bird.mesh.geometry.dispose();
            }
            if (bird.mesh && bird.mesh.material) {
                if (Array.isArray(bird.mesh.material)) {
                    bird.mesh.material.forEach(material => material.dispose());
                } else {
                    bird.mesh.material.dispose();
                }
            }
            
            // Remove from collection
            this.birds.delete(id);
            console.log(`[BIRD] Removed bird ${id}, count: ${this.birds.size}`);
            
            // Network bird removal if we're the host
            if (this.engine.networkManager?.isHost) {
                this.engine.networkManager.send({
                    type: 'birdRemoved',
                    data: { id }
                });
            }
        }
    }

    handleBulletCollision(bullet) {
        try {
            if (!bullet || !bullet.position || !bullet.velocity) {
                console.error('[BIRD] Invalid bullet data for collision check');
                return false;
            }

            // Check collision with each bird
            const bulletVelocity = bullet.velocity.clone();
            const bulletPath = new THREE.Line3(
                bullet.position.clone().sub(bulletVelocity), // Previous position
                bullet.position.clone() // Current position
            );

            for (const [id, bird] of this.birds) {
                if (!bird || !bird.position) continue;

                // Use a slightly larger sphere for collision detection
                const birdSphere = new THREE.Sphere(bird.position, 0.075);
                
                // Check if bullet's path intersects with the sphere
                const intersection = this.checkBulletSpherePath(bulletPath, birdSphere);
                
                if (intersection) {
                    console.log(`[BIRD] Collision detected between bullet and bird ${id}`);
                    
                    // Track the bird as being processed to prevent duplicate handling
                    bird.isBeingProcessed = true;
                    
                    // Get the bird's position for the explosion effect
                    const explosionPosition = bird.position.clone();

                    // FOR LOCAL HITS ONLY - Play immediate feedback for shooter
                    // This gives immediate feedback to the shooter but final validation comes from the server
                    if (bullet.shooterId === this.engine.networkManager?.localPlayerId) {
                        // Play effects locally for immediate feedback
                        if (this.engine.particleManager) {
                            this.engine.particleManager.createExplosion(explosionPosition);
                            console.log('[BIRD] Created local hit particle effect for immediate feedback');
                        }
                        
                        if (this.engine.audioManager) {
                            this.engine.audioManager.playBirdDestruction();
                            console.log('[BIRD] Played local hit sound for immediate feedback');
                        }
                        
                        // Add haptic feedback for VR
                        this.triggerHapticFeedback(1.0, 150);
                    }

                    // If we're a client
                    if (this.engine.networkManager && !this.engine.networkManager.isHost) {
                        // Send hit attempt to host for validation with extra data
                        console.log('[BIRD] Client sending hit attempt to host');
                        this.engine.networkManager.send({
                            type: 'birdHitAttempt',
                            data: {
                                birdId: id,
                                bulletShooterId: bullet.shooterId,
                                position: explosionPosition.toArray(),
                                bulletPosition: bullet.position.toArray(),
                                bulletVelocity: bullet.velocity.toArray()
                            }
                        });
                    }
                    // If we're the host
                    else if (this.engine.networkManager?.isHost) {
                        // Store the hit data to prevent double processing
                        this.lastHostHitData = {
                            birdId: id,
                            bulletShooterId: bullet.shooterId,
                            timestamp: Date.now()
                        };
                        
                        // Only update score if it's our own bullet
                        if (bullet.shooterId === this.engine.networkManager.localPlayerId) {
                            console.log('[BIRD] Host updating own score for hit');
                            this.engine.scoreManager?.updateScore(bullet.shooterId, 10);
                            
                            // Make sure score gets updated for all clients
                            const hostScore = this.engine.scoreManager?.scores.get(bullet.shooterId) || 0;
                            this.engine.networkManager.broadcastScoreUpdate(bullet.shooterId, hostScore);
                            console.log(`[BIRD] Host broadcasting score update: Player ${bullet.shooterId} = ${hostScore}`);
                            
                            // Only force a full scores sync on first hit (going from 0 to 10)
                            if (hostScore === 10) {
                                console.log('[BIRD] First hit detected, sending full score sync to ensure client consistency');
                                setTimeout(() => {
                                    this.engine.networkManager.syncAllScores();
                                }, 200); // Small delay to ensure local updates go through first
                            }
                        }
                        
                        // Broadcast the hit to all clients
                        this.engine.networkManager.send({
                            type: 'birdHit',
                            data: {
                                birdId: id,
                                bulletShooterId: bullet.shooterId,
                                position: explosionPosition.toArray(),
                                points: 10
                            }
                        });
                    }
                    
                    // Remove the bird immediately to prevent duplicate hits
                    this.removeBird(id);
                    
                    return true; // Collision detected
                }
            }
            return false;
        } catch (error) {
            console.error('[BIRD] Error in bullet collision check:', error);
            return false;
        }
    }

    // Centralized method to trigger haptic feedback
    triggerHapticFeedback(intensity = 1.0, duration = 150) {
        try {
            if (this.engine.renderer?.xr.isPresenting) {
                const session = this.engine.renderer.xr.getSession();
                if (session && session.inputSources) {
                    session.inputSources.forEach(inputSource => {
                        if (inputSource.gamepad && this.engine.inputManager) {
                            this.engine.inputManager.triggerHapticFeedback(inputSource.gamepad, intensity, duration);
                            console.log(`[BIRD] Triggered haptic feedback: intensity=${intensity}, duration=${duration}`);
                        }
                    });
                }
            }
        } catch (error) {
            console.warn('[BIRD] Error triggering haptic feedback:', error);
        }
    }

    handleNetworkBirdHit(data) {
        try {
            if (!data || !this.engine.networkManager) {
                console.error('[BIRD] Invalid network bird hit data or missing network manager');
                return;
            }

            const { birdId, bulletShooterId, position, points } = data;
            
            // Safety check for required data
            if (!birdId || !bulletShooterId || !position) {
                console.error('[BIRD] Missing required data in network bird hit:', data);
                return;
            }

            console.log('[BIRD] Processing network bird hit:', data);
            
            // Check if this is a host message for its own shot (avoid double processing)
            const isLocalPlayer = bulletShooterId === this.engine.networkManager.localPlayerId;
            const isHostSelfMessage = isLocalPlayer && this.engine.networkManager.isHost;
            
            // Skip this entire function for the host's own hits to avoid duplicate processing
            // The host already processed these locally in handleBulletCollision
            if (isHostSelfMessage) {
                console.log('[BIRD] Host skipping network hit processing for own shot to prevent duplicates');
                return;
            }
            
            // Extract position data for effects
            const explosionPos = new THREE.Vector3().fromArray(position);
            
            // Create explosion effect - host should see ALL effects, clients skip only their own shots
            const shouldSkipEffect = isLocalPlayer && !this.engine.networkManager.isHost;
            
            if (!shouldSkipEffect && this.engine.particleManager) {
                this.engine.particleManager.createExplosion(explosionPos);
                console.log(`[BIRD] Created network hit explosion at position [${explosionPos.x.toFixed(2)}, ${explosionPos.y.toFixed(2)}, ${explosionPos.z.toFixed(2)}]`);
            } else if (shouldSkipEffect) {
                console.log('[BIRD] Skipping explosion for local shooter who already saw it');
            } else {
                console.warn('[BIRD] Unable to create explosion: ParticleManager not available');
            }
            
            // Play sound - host should hear ALL sounds, clients skip only their own shots
            if (!shouldSkipEffect && this.engine.audioManager) {
                this.engine.audioManager.playBirdDestruction();
                console.log('[BIRD] Played network hit sound');
            } else if (shouldSkipEffect) {
                console.log('[BIRD] Skipping sound for local shooter who already heard it');
            } else {
                console.warn('[BIRD] Unable to play sound: AudioManager not available');
            }
            
            // Add haptic feedback for VR for everyone EXCEPT the shooter
            if (!isLocalPlayer) {
                this.triggerHapticFeedback(0.8, 100);
            }

            // Update scores: Skip score update for host's own hit to avoid double counting
            if (this.engine.scoreManager && !isHostSelfMessage) {
                // If we don't have this player in our scores yet, add them
                if (!this.engine.scoreManager.scores.has(bulletShooterId)) {
                    console.log(`[BIRD] Adding new player ${bulletShooterId} to score table`);
                    this.engine.scoreManager.addPlayer(bulletShooterId);
                }
                
                // Update the score and display
                const currentScore = this.engine.scoreManager.scores.get(bulletShooterId) || 0;
                const newScore = currentScore + points;
                console.log(`[BIRD] Network hit: updating score for player ${bulletShooterId} from ${currentScore} to ${newScore}`);
                
                this.engine.scoreManager.scores.set(bulletShooterId, newScore);
                this.engine.scoreManager.updateScoreDisplay();
                
                // Update VR scores if available
                if (this.engine.scoreManager.vrScoreUI) {
                    this.engine.scoreManager.updateVRScores();
                }
            }

            // If bird still exists, remove it
            if (this.birds.has(birdId)) {
                console.log(`[BIRD] Removing bird ${birdId} after network hit confirmation`);
                this.removeBird(birdId);
            } else {
                console.log(`[BIRD] Bird ${birdId} already removed`);
            }
        } catch (error) {
            console.error('[BIRD] Error handling network bird hit:', error);
        }
    }

    checkBulletSpherePath(bulletPath, sphere) {
        // Get the closest point on the line to the sphere center
        const closestPoint = new THREE.Vector3();
        bulletPath.closestPointToPoint(sphere.center, true, closestPoint);

        // Check if the closest point is within the line segment and sphere
        // Use a slightly larger collision radius for more generous hit detection
        const collisionRadius = sphere.radius * 1.25; // 25% larger collision radius
        
        if (closestPoint.distanceTo(sphere.center) <= collisionRadius) {
            // Check if the point is actually on our line segment
            const lineStart = bulletPath.start;
            const lineEnd = bulletPath.end;
            
            // Calculate the projection onto the line
            const lineDirection = lineEnd.clone().sub(lineStart).normalize();
            const pointToStart = closestPoint.clone().sub(lineStart);
            const dotProduct = pointToStart.dot(lineDirection);
            
            // Check if the point lies between start and end
            const lineLength = lineStart.distanceTo(lineEnd);
            if (dotProduct >= 0 && dotProduct <= lineLength) {
                return true;
            }
        }
        return false;
    }

    handleNetworkBirdSpawn(data) {
        console.log('[BIRD] Handling network ball spawn:', data);
        const position = new THREE.Vector3().fromArray(data.position);
        const direction = new THREE.Vector3().fromArray(data.direction);

        // Create bird with received movement data to ensure consistent movement
        const bird = new Bird(position, direction, data.movementData);
        bird.visible = true; // Ensure visibility
        
        // Use server time + time offset to account for network delay
        bird.spawnTime = data.spawnTime;
        bird.birdManager = this;
        
        // Check bird has meshes
        console.log('[BIRD] Network ball has children:', bird.children.length);
        
        // Store in birds map
        this.birds.set(data.id, bird);
        
        // Add to scene
        this.engine.scene.add(bird);
        console.log('[BIRD] Network ball added to scene with ID:', data.id);

        // Create the visual bounding box helper for debugging
        if (this.debug) {
            const boxHelper = new THREE.BoxHelper(bird, 0xffff00);
            this.engine.scene.add(boxHelper);
            bird.boxHelper = boxHelper;
            console.log('[BIRD] Added debug box helper for network ball');
        }

        // Play spawn sound if requested - always synchronized with spawn
        if (data.playSound && this.engine.audioManager) {
            this.engine.audioManager.playBirdSpawn();
            console.log('[BIRD] Played spawn sound for network ball');
        }

        // Make sure spawning is enabled when receiving network birds
        this.isSpawning = true;
    }

    handleNetworkBirdRemoved(data) {
        console.log('[BIRD] Handling network bird removal for bird:', data.id);
        // Track this as a network-triggered removal
        this._lastRemovedBirdIdByNetwork = data.id;
        
        if (this.birds.has(data.id)) {
            const bird = this.birds.get(data.id);
            this.engine.scene.remove(bird);
            this.birds.delete(data.id);
            console.log('[BIRD] Bird removed successfully');
        } else {
            console.warn('[BIRD] Bird not found for removal:', data.id);
        }
        
        // Clear the tracking after a short delay
        setTimeout(() => {
            this._lastRemovedBirdIdByNetwork = null;
        }, 100);
    }

    handleBirdKilled(data) {
        const bird = this.birds.get(data.id);
        if (bird) {
            // Update score
            if (data.shooterId) {
                this.engine.scoreManager.updateScore(data.shooterId, 10);
            }

            // Remove the bird
            this.removeBird(data.id);
        }
    }

    startSpawning() {
        this.isSpawning = true;
        console.log('[BIRD] Bird spawning started');
        
        // Force spawn a few birds immediately if we're the host
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            console.log('[BIRD] Host forcing initial bird spawn');
            this.lastSpawnTime = Date.now() - this.spawnInterval; // Force immediate spawn
        }
    }

    stopSpawning() {
        this.isSpawning = false;
        console.log('[BIRD] Bird spawning stopped');
        // Remove all birds
        for (const id of this.birds.keys()) {
            this.removeBird(id);
        }
    }
}

