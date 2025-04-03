import * as THREE from 'three';
import { Bird } from '../entities/Bird.js';

export class BirdManager {
    constructor(engine) {
        this.engine = engine;
        this.birds = new Map();
        this.lastSpawnTime = 0;
        this.spawnInterval = 7000; // 7 seconds between spawns
        this.maxBirds = 6; // Maximum number of birds allowed
        this.isSpawning = false;

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
            minX: -(platformDimensions.width / 12), // 1/3 of previous value (was 1/4)
            maxX: (platformDimensions.width / 12),  // 1/3 of previous value (was 1/4)
            minY: platformDimensions.y + heightOffset, 
            maxY: platformDimensions.y + heightOffset + spawnHeight,
            minZ: -(platformDimensions.depth / 12), // 1/3 of previous value (was 1/4)
            maxZ: (platformDimensions.depth / 12)   // 1/3 of previous value (was 1/4)
        };
        
        console.log('[BIRD] Spawn boundaries (3x smaller):', this.spawnBoundary);
    }

    update(delta) {
        if (!this.isSpawning) return;

        const currentTime = Date.now();

        // Only host spawns birds
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            if (currentTime - this.lastSpawnTime > this.spawnInterval && this.birds.size < this.maxBirds) {
                const birdsToSpawn = Math.min(3, this.maxBirds - this.birds.size);
                for (let i = 0; i < birdsToSpawn; i++) {
                    this.spawnBird();
                }
                this.lastSpawnTime = currentTime;
            }
        }

        // Update all birds
        for (const [id, bird] of this.birds) {
            if (bird.update(delta)) {
                this.removeBird(id);
            }
        }
    }

    spawnBird() {
        const x = THREE.MathUtils.randFloat(this.spawnBoundary.minX, this.spawnBoundary.maxX);
        const y = THREE.MathUtils.randFloat(this.spawnBoundary.minY, this.spawnBoundary.maxY);
        const z = THREE.MathUtils.randFloat(this.spawnBoundary.minZ, this.spawnBoundary.maxZ);

        const position = new THREE.Vector3(x, y, z);
        const direction = new THREE.Vector3(1, 0, 0);

        const bird = new Bird(position, direction);
        bird.birdManager = this;
        this.birds.set(bird.uuid, bird);
        this.engine.scene.add(bird);

        // Play spawn sound
        this.engine.audioManager.playBirdSpawn();

        // Network the spawn if we're the host
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            this.engine.networkManager.send({
                type: 'birdSpawned',
                data: {
                    id: bird.uuid,
                    position: position.toArray(),
                    direction: direction.toArray(),
                    spawnTime: bird.spawnTime,
                    playSound: true  // Add sound flag
                }
            });
        }

        return bird;
    }

    removeBird(id) {
        const bird = this.birds.get(id);
        if (bird) {
            this.engine.scene.remove(bird);
            this.birds.delete(id);

            // Network the removal if we're the host
            if (this.engine.networkManager && this.engine.networkManager.isHost) {
                this.engine.networkManager.send({
                    type: 'birdRemoved',
                    data: {
                        id: id
                    }
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

                const birdSphere = new THREE.Sphere(bird.position, 0.075);
                
                // Check if bullet's path intersects with the sphere
                const intersection = this.checkBulletSpherePath(bulletPath, birdSphere);
                
                if (intersection) {
                    // Get the bird's position for the explosion effect
                    const explosionPosition = bird.position.clone();

                    // Remove the bird immediately to prevent duplicate hits
                    this.removeBird(id);

                    // Create particle explosion only (sound will be handled by network hit)
                    if (this.engine.particleManager) {
                        this.engine.particleManager.createExplosion(explosionPosition);
                    }

                    // Add strong haptic feedback for bird destruction
                    if (this.engine.renderer?.xr.isPresenting) {
                        const session = this.engine.renderer.xr.getSession();
                        if (session && session.inputSources) {
                            session.inputSources.forEach(inputSource => {
                                if (inputSource.gamepad && this.engine.inputManager) {
                                    this.engine.inputManager.triggerHapticFeedback(inputSource.gamepad, 1.0, 150);
                                }
                            });
                        }
                    }

                    // If we're the host
                    if (this.engine.networkManager?.isHost) {
                        // Only update score if it's our own bullet
                        if (bullet.shooterId === this.engine.networkManager.localPlayerId) {
                            console.log('[BIRD] Host updating own score for hit');
                            this.engine.scoreManager?.updateScore(bullet.shooterId, 10);
                            // Play sound for host's own hits
                            this.engine.audioManager?.playBirdDestruction();
                            
                            // Make sure score gets updated for all clients
                            const hostScore = this.engine.scoreManager?.scores.get(bullet.shooterId) || 0;
                            this.engine.networkManager.broadcastScoreUpdate(bullet.shooterId, hostScore);
                            console.log(`[BIRD] Host broadcasting score update: Player ${bullet.shooterId} = ${hostScore}`);
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
                    // If we're a client
                    else if (this.engine.networkManager) {
                        // Send hit attempt to host for validation
                        console.log('[BIRD] Client sending hit attempt to host');
                        this.engine.networkManager.send({
                            type: 'birdHitAttempt',
                            data: {
                                birdId: id,
                                bulletShooterId: bullet.shooterId,
                                position: explosionPosition.toArray()
                            }
                        });
                    }
                    
                    return true; // Collision detected
                }
            }
            return false;
        } catch (error) {
            console.error('[BIRD] Error in bullet collision check:', error);
            return false;
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
            
            // Always play sound effect for bird destruction, regardless of shooter
            this.engine.audioManager?.playBirdDestruction();

            // Only update score if:
            // 1. We're a client (not host)
            // 2. The bullet was shot by us
            // 3. We have a score manager
            if (!this.engine.networkManager.isHost && 
                bulletShooterId === this.engine.networkManager.localPlayerId &&
                this.engine.scoreManager) {
                console.log('[BIRD] Updating score for client hit:', bulletShooterId, points);
                this.engine.scoreManager.updateScore(bulletShooterId, points);
                
                // Explicitly broadcast our updated score to ensure it's visible to all players
                const clientScore = this.engine.scoreManager.scores.get(bulletShooterId) || 0;
                this.engine.networkManager.broadcastScoreUpdate(bulletShooterId, clientScore);
                console.log(`[BIRD] Client broadcasting score update: Player ${bulletShooterId} = ${clientScore}`);
            }
            
            // Update the shooter's score in our local score manager
            // This ensures we show scores for shots we didn't make
            if (this.engine.scoreManager && bulletShooterId !== this.engine.networkManager.localPlayerId) {
                // If we don't have this player in our scores yet, add them
                if (!this.engine.scoreManager.scores.has(bulletShooterId)) {
                    this.engine.scoreManager.addPlayer(bulletShooterId);
                }
                
                // Calculate the new score without calling updateScore (which might trigger broadcasts)
                const currentScore = this.engine.scoreManager.scores.get(bulletShooterId) || 0;
                const newScore = currentScore + points;
                
                console.log(`[BIRD] Updating remote player score: Player ${bulletShooterId} = ${newScore}`);
                this.engine.scoreManager.scores.set(bulletShooterId, newScore);
                this.engine.scoreManager.updateScoreDisplay();
                
                // Update VR scores if available
                if (this.engine.scoreManager.vrScoreUI) {
                    this.engine.scoreManager.updateVRScores();
                }
            }

            // Handle visual effects
            try {
                // Create explosion effect
                if (this.engine.particleManager) {
                    const explosionPos = new THREE.Vector3().fromArray(position);
                    this.engine.particleManager.createExplosion(explosionPos);
                }
            } catch (effectError) {
                console.error('[BIRD] Error playing hit effects:', effectError);
            }

            // Remove the bird if it exists
            if (this.birds.has(birdId)) {
                this.removeBird(birdId);
            } else {
                console.warn('[BIRD] Bird not found for network hit:', birdId);
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
        if (closestPoint.distanceTo(sphere.center) <= sphere.radius) {
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
        console.debug('[DEBUG] Handling network bird spawn:', data);
        const position = new THREE.Vector3().fromArray(data.position);
        const direction = new THREE.Vector3().fromArray(data.direction);

        const bird = new Bird(position, direction);
        bird.spawnTime = data.spawnTime;
        this.birds.set(data.id, bird);
        this.engine.scene.add(bird);

        // Play spawn sound if requested
        if (data.playSound) {
            this.engine.audioManager.playBirdSpawn();
        }

        // Make sure spawning is enabled when receiving network birds
        this.isSpawning = true;
    }

    handleNetworkBirdRemoved(data) {
        this.removeBird(data.id);
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
    }

    stopSpawning() {
        this.isSpawning = false;
        // Remove all birds
        for (const id of this.birds.keys()) {
            this.removeBird(id);
        }
    }
}
