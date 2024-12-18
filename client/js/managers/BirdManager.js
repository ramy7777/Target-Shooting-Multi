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

        // Get platform dimensions
        const platform = this.engine.world?.ground;
        let platformDimensions, roomDimensions;
        if (platform) {
            const boundingBox = new THREE.Box3().setFromObject(platform);
            const size = boundingBox.getSize(new THREE.Vector3());
            platformDimensions = {
                width: size.x * 0.7225,  // Reduce width by another 15% (0.85 * 0.85)
                depth: size.z * 0.7225   // Reduce depth by another 15% (0.85 * 0.85)
            };
            roomDimensions = {
                width: size.x * 1.2,    // 20% larger than platform
                height: Math.max(size.x, size.z) * 0.8, // Height proportional to width/depth
                depth: size.z * 1.2     // 20% larger than platform
            };
        } else {
            // Fallback dimensions if platform not loaded
            platformDimensions = {
                width: 2.89,  // 4 * 0.7225
                depth: 1.80625 // 2.5 * 0.7225
            };
            roomDimensions = {
                width: 5,
                height: 3,
                depth: 3
            };
        }

        // Calculate spawn boundaries to be above the platform
        const sphereRadius = 0.15; // Approximate radius of the sphere
        const minHeightAbovePlatform = 0.65; // Increased minimum height to 0.65m above platform
        const safetyMargin = sphereRadius * 2; // Margin from platform edges

        this.spawnBoundary = {
            // Use reduced platform dimensions for X and Z, with safety margin from edges
            minX: -(platformDimensions.width / 2) + safetyMargin,
            maxX: (platformDimensions.width / 2) - safetyMargin,
            // Height range from increased min height above platform to room height
            minY: minHeightAbovePlatform,
            maxY: roomDimensions.height - safetyMargin,
            minZ: -(platformDimensions.depth / 2) + safetyMargin,
            maxZ: (platformDimensions.depth / 2) - safetyMargin
        };
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
        if (this.birds.size >= this.maxBirds) return;

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
        // Check collision with each bird
        const bulletVelocity = bullet.velocity.clone();
        const bulletPath = new THREE.Line3(
            bullet.position.clone().sub(bulletVelocity), // Previous position
            bullet.position.clone() // Current position
        );

        for (const [id, bird] of this.birds) {
            const birdSphere = new THREE.Sphere(bird.position, 0.075);
            
            // Check if bullet's path intersects with the sphere
            const intersection = this.checkBulletSpherePath(bulletPath, birdSphere);
            
            if (intersection) {
                // Get the bird's position for the explosion effect
                const explosionPosition = bird.position.clone();

                // Remove the bird immediately to prevent duplicate hits
                this.removeBird(id);

                // Play destruction sound effect
                if (this.engine.audioManager) {
                    this.engine.audioManager.playBirdDestruction();
                }

                // Create particle explosion
                if (this.engine.particleManager) {
                    this.engine.particleManager.createExplosion(explosionPosition);
                }

                // Add strong haptic feedback for bird destruction
                if (this.engine.renderer.xr.isPresenting) {
                    const session = this.engine.renderer.xr.getSession();
                    if (session && session.inputSources) {
                        session.inputSources.forEach(inputSource => {
                            if (inputSource.gamepad && this.engine.inputManager) {
                                this.engine.inputManager.triggerHapticFeedback(inputSource.gamepad, 1.0, 150);
                            }
                        });
                    }
                }

                // If we're the host, validate the hit and update scores
                if (this.engine.networkManager?.isHost) {
                    // Update score for the shooter
                    this.engine.scoreManager.updateScore(bullet.shooterId, 10);
                    
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
                } else {
                    // For clients, send hit attempt to host for validation
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
    }

    handleNetworkBirdHit(data) {
        const { birdId, bulletShooterId, position, points } = data;
        
        // Only update score if we're not the host (host already updated)
        if (!this.engine.networkManager?.isHost) {
            this.engine.scoreManager.updateScore(bulletShooterId, points);
        }

        // Remove the bird if it still exists
        if (this.birds.has(birdId)) {
            this.removeBird(birdId);
            
            // Create explosion effect
            if (this.engine.particleManager) {
                const explosionPos = new THREE.Vector3().fromArray(position);
                this.engine.particleManager.createExplosion(explosionPos);
            }

            // Play sound
            if (this.engine.audioManager) {
                this.engine.audioManager.playBirdDestruction();
            }
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
