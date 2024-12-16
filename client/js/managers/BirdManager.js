import * as THREE from 'three';
import { Bird } from '../entities/Bird.js';

export class BirdManager {
    constructor(engine) {
        this.engine = engine;
        this.birds = new Map();
        this.lastSpawnTime = 0;
        this.spawnInterval = 10000; // 10 seconds between spawns
        this.maxBirds = 6; // Maximum number of birds allowed
        this.isSpawning = false;

        // Match spawn boundaries exactly with holographic room dimensions
        const roomDimensions = {
            width: 5,    // Room width is 5 meters
            height: 3,   // Room height is 3 meters
            depth: 3,    // Room depth is 3 meters
            y: 2        // Room is 2 meters above floor
        };

        // Calculate spawn boundaries to be inside the border lines (2% inset from edges)
        const borderInset = 0.02; // Matches the border thickness in shader (0.02)
        const safetyPadding = 0.1; // Additional 10cm safety padding for sphere size
        const totalPadding = borderInset + safetyPadding;

        this.spawnBoundary = {
            minX: -(roomDimensions.width / 2) + totalPadding,
            maxX: (roomDimensions.width / 2) - totalPadding,
            minY: roomDimensions.y + totalPadding - 1.5,
            maxY: roomDimensions.y + roomDimensions.height - totalPadding - 1.5,
            minZ: -(roomDimensions.depth / 2) + totalPadding,
            maxZ: (roomDimensions.depth / 2) - totalPadding
        };
    }

    update(delta) {
        if (!this.isSpawning) return;

        const currentTime = Date.now();

        // Only host spawns birds
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            if (currentTime - this.lastSpawnTime > this.spawnInterval && this.birds.size < this.maxBirds) {
                const birdsToSpawn = Math.min(2, this.maxBirds - this.birds.size);
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

        // Network the spawn if we're the host
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            this.engine.networkManager.send({
                type: 'birdSpawned',
                data: {
                    id: bird.uuid,
                    position: position.toArray(),
                    direction: direction.toArray(),
                    spawnTime: bird.spawnTime
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

                // Remove the bird
                this.removeBird(id);

                // Update score immediately for both host and client
                this.engine.scoreManager.updateScore(bullet.shooterId, 10);

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

                // If we're the host, send the hit event
                if (this.engine.networkManager && this.engine.networkManager.isHost) {
                    this.engine.networkManager.send({
                        type: 'birdHit',
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

        // Make sure spawning is enabled when receiving network birds
        this.isSpawning = true;
    }

    handleNetworkBirdRemoved(data) {
        this.removeBird(data.id);
    }

    handleNetworkBirdHit(data) {
        // Get the bird's position before removing it
        const bird = this.birds.get(data.birdId);
        const position = bird ? bird.position.clone() : new THREE.Vector3();

        // Remove the bird that was hit
        this.removeBird(data.birdId);
        
        // Play destruction sound effect
        if (this.engine.audioManager) {
            this.engine.audioManager.playBirdDestruction();
        }

        // Create particle explosion using the position from the network message
        if (this.engine.particleManager) {
            const explosionPosition = data.position ? new THREE.Vector3().fromArray(data.position) : position;
            this.engine.particleManager.createExplosion(explosionPosition);
        }
        
        // Update score for the shooter
        if (data.bulletShooterId) {
            this.engine.scoreManager.updateScore(data.bulletShooterId, 10);
        }
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
