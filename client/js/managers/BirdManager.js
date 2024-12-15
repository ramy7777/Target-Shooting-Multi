import * as THREE from 'three';
import { HolographicBall } from '../entities/HolographicBall.js';
import AudioManager from './AudioManager.js';

export class BirdManager {
    constructor(engine) {
        this.engine = engine;
        this.birds = new Map();
        this.lastSpawnTime = 0;
        this.spawnInterval = 10000; // 10 seconds between spawns
        this.activeParticleSystems = [];
        this.maxBirds = 6; // Maximum number of birds allowed
        this.isSpawning = false;

        // Boundary for spawning within holographic room (5x3x3 meters, 2 meters above floor)
        const margin = 0.2; // 20cm margin from walls
        this.spawnBoundary = {
            minX: -2.3,  // -2.5 + margin
            maxX: 2.3,   // 2.5 - margin
            minY: 2.2,   // 2.0 + margin
            maxY: 4.0,   // 2.0 + 2.0 (reduced height to ensure no spawns above)
            minZ: -1.3,  // -1.5 + margin
            maxZ: 1.3    // 1.5 - margin
        };

        // Active particles
        this.activeParticles = new Set();
        this.audioManager = new AudioManager();
    }

    update(delta) {
        if (!this.isSpawning) {
            console.debug('[BIRDMANAGER] Not spawning - isSpawning is false');
            return;
        }

        const currentTime = Date.now();

        // Only host spawns birds
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            // Only spawn if we're under the bird limit
            if (currentTime - this.lastSpawnTime > this.spawnInterval && this.birds.size < this.maxBirds) {
                console.debug('[BIRDMANAGER] Host spawning new birds. Current count:', this.birds.size);
                // Calculate how many birds we can spawn without exceeding the limit
                const birdsToSpawn = Math.min(2, this.maxBirds - this.birds.size);
                for (let i = 0; i < birdsToSpawn; i++) {
                    this.spawnBird();
                }
                this.lastSpawnTime = currentTime;
            }
        }

        // Update existing birds
        console.debug(`[BIRDMANAGER] Updating ${this.birds.size} birds. Is Host:`, this.engine.networkManager?.isHost);
        for (const [id, bird] of this.birds) {
            const shouldRemove = bird.update(delta);
            if (shouldRemove) {
                // Bird's lifetime has ended, remove it
                console.debug(`[BIRDMANAGER] Removing bird ${id.slice(0,4)} due to lifetime end`);
                this.removeBird(id);

                // If we're the host, schedule next spawn
                if (this.engine.networkManager && this.engine.networkManager.isHost) {
                    this.lastSpawnTime = currentTime;
                }
            }
        }

        // Update particle systems
        if (this.activeParticleSystems) {
            for (let i = this.activeParticleSystems.length - 1; i >= 0; i--) {
                const particles = this.activeParticleSystems[i];
                if (particles.update(delta)) {
                    // Particle system is done, remove it
                    if (particles.parent) {
                        particles.parent.remove(particles);
                    }
                    this.activeParticleSystems.splice(i, 1);
                }
            }
        }
    }

    spawnBird() {
        // Generate random position within the holographic room
        const x = this.spawnBoundary.minX + Math.random() * (this.spawnBoundary.maxX - this.spawnBoundary.minX);
        const y = this.spawnBoundary.minY + Math.random() * (this.spawnBoundary.maxY - this.spawnBoundary.minY);
        const z = this.spawnBoundary.minZ + Math.random() * (this.spawnBoundary.maxZ - this.spawnBoundary.minZ);
        const position = new THREE.Vector3(x, y, z);

        // Create holographic ball (direction is not used for movement anymore)
        const direction = new THREE.Vector3(0, 0, 0);
        const ball = new HolographicBall(position, direction);
        ball.birdManager = this; // Important: Set the manager reference for networking

        // Generate unique ID
        const id = crypto.randomUUID();
        ball.uuid = id; // Set the UUID directly
        this.birds.set(id, ball);

        // Add to scene
        this.engine.scene.add(ball);

        // Broadcast spawn event if we're the host
        if (this.engine.networkManager && this.engine.networkManager.isHost) {
            this.engine.networkManager.send({
                type: 'birdSpawned',
                data: {
                    id: id,
                    position: position.toArray(),
                    direction: direction.toArray()
                }
            });
        }

        return id;
    }

    removeBird(id) {
        const bird = this.birds.get(id);
        if (bird) {
            this.engine.scene.remove(bird);
            this.birds.delete(id);
            console.debug('[DEBUG] Bird removed:', id);

            // Network the bird removal if we're the host
            if (this.engine.networkManager && this.engine.networkManager.isHost) {
                console.debug('[DEBUG] Sending bird removal message');
                this.engine.networkManager.send({
                    type: 'birdRemoved',
                    data: { id: id }
                });
            }
        }
    }

    handleNetworkBirdSpawn(data) {
        // Only create the bird if it doesn't already exist
        if (!this.birds.has(data.id)) {
            console.debug(`[BIRDMANAGER] Handling network bird spawn for ID: ${data.id}`);
            const position = new THREE.Vector3().fromArray(data.position);
            const direction = new THREE.Vector3().fromArray(data.direction);

            const ball = new HolographicBall(position, direction);
            ball.uuid = data.id;
            this.birds.set(data.id, ball);
            this.engine.scene.add(ball);

            console.debug(`[BIRD ${data.id.slice(0,4)}] Network bird spawned successfully:
                Position: ${position.toArray().map(n => n.toFixed(2))}
                Direction: ${direction.toArray().map(n => n.toFixed(2))}
            `);
        } else {
            console.debug(`[BIRDMANAGER] Bird ${data.id} already exists, ignoring spawn event`);
        }
    }

    handleNetworkBirdRemoved(data) {
        console.debug('[DEBUG] Handling network bird removal:', data);

        // Find and remove the bird with the matching ID
        this.removeBird(data.id);
    }

    handleBulletCollision(bullet) {
        for (const [id, bird] of this.birds) {
            // Get bullet position
            const bulletPos = bullet.position;
            
            // Check if bullet is close to the ball (sphere collision)
            const distance = bulletPos.distanceTo(bird.position);
            if (distance < 0.2) { // 20cm collision radius
                // Apply damage and check if bird is destroyed
                const destroyed = bird.takeDamage(25, bulletPos);
                
                if (destroyed) {
                    // Play destruction sound
                    this.audioManager.playBirdDestruction();

                    // Create hit effect at bullet position
                    this.createHitEffect(bulletPos);

                    // Create death effect at bird position
                    this.createDeathEffect(bird.position);

                    // Trigger haptic feedback
                    if (this.engine.renderer.xr.isPresenting) {
                        const session = this.engine.renderer.xr.getSession();
                        for (const source of session.inputSources) {
                            if (source.gamepad && source.gamepad.hapticActuators) {
                                source.gamepad.hapticActuators[0].pulse(1.0, 100);
                            }
                        }
                    }

                    // Increment score if we're the host
                    if (this.engine.networkManager && this.engine.networkManager.isHost) {
                        const shooterId = bullet.shooterId;
                        if (shooterId) {
                            this.engine.scoreManager.updateScore(shooterId, 100);
                        }
                    }

                    // Network the kill
                    if (this.engine.networkManager) {
                        this.engine.networkManager.send({
                            type: 'birdKilled',
                            data: {
                                id: id,
                                position: bird.position.toArray(),
                                shooterId: bullet.shooterId
                            }
                        });
                    }

                    // Remove the bird
                    this.removeBird(id);
                }
                return true; // Bullet hit something
            }
        }
        return false; // Bullet didn't hit anything
    }

    handleBirdKilled(data) {
        const bird = this.birds.get(data.id);
        if (bird) {
            // Update score for the shooter if we're receiving this from the network
            if (data.shooterId && this.engine.scoreManager) {
                this.engine.scoreManager.updateScore(data.shooterId, 10);
            }

            // Play bird destruction sound
            this.audioManager.playBirdDestruction();

            // Create particle effect at the bird's position
            const position = new THREE.Vector3().fromArray(data.position);
            this.createDeathEffect(position);

            // Remove the bird
            this.engine.scene.remove(bird);
            this.birds.delete(data.id);
        }
    }

    handleNetworkBirdUpdate(data) {
        // Find the bird with the matching ID
        const bird = this.birds.get(data.id);
        if (bird) {
            // Update position, rotation and age
            bird.updateFromNetwork(data.position, data.rotation, data.age);
        }
    }

    handleNetworkBirdDirectionChange(data) {
        // Find the bird with the matching ID
        const bird = this.birds.get(data.id);
        if (bird) {
            // Update direction and position
            bird.position.fromArray(data.position);
            bird.direction.fromArray(data.direction);
            bird.lookAt(bird.position.clone().add(bird.direction));
        }
    }

    createHitEffect(position) {
        // Create a particle system for the hit effect
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const numParticles = 20;

        for (let i = 0; i < numParticles; i++) {
            vertices.push(0, 0, 0); // All particles start at hit position
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const material = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.05,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(geometry, material);
        particles.position.copy(position);

        // Add velocities to particles
        const velocities = [];
        for (let i = 0; i < numParticles; i++) {
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2
            );
            velocities.push(velocity);
        }

        particles.velocities = velocities;
        particles.birthTime = Date.now();
        
        particles.update = function(delta) {
            const age = Date.now() - this.birthTime;
            const lifespan = 500; // 500ms lifetime
            
            if (age > lifespan) {
                return true; // Remove particles
            }

            const positions = this.geometry.attributes.position.array;
            
            for (let i = 0; i < this.velocities.length; i++) {
                const offset = i * 3;
                const velocity = this.velocities[i];
                
                positions[offset] += velocity.x * delta;
                positions[offset + 1] += velocity.y * delta;
                positions[offset + 2] += velocity.z * delta;
            }
            
            this.geometry.attributes.position.needsUpdate = true;
            material.opacity = 1 - (age / lifespan);
            
            return false;
        };

        this.engine.scene.add(particles);
        this.activeParticleSystems.push(particles);
    }

    createDeathEffect(position) {
        // Create particle system for death effect
        const particleCount = 15;  
        const particles = new THREE.Group();

        for (let i = 0; i < particleCount; i++) {
            const feather = new THREE.Mesh(
                new THREE.PlaneGeometry(0.05, 0.15),  
                new THREE.MeshBasicMaterial({
                    color: 0x000000,  
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 1
                })
            );

            // Random position spread 
            feather.position.copy(position).add(
                new THREE.Vector3(
                    (Math.random() - 0.5) * 0.25,  
                    (Math.random() - 0.5) * 0.25,  
                    (Math.random() - 0.5) * 0.25   
                )
            );

            // Random velocity
            feather.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.1,
                Math.random() * 0.05,
                (Math.random() - 0.5) * 0.1
            );

            // Random rotation
            feather.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );

            feather.rotationSpeed = new THREE.Vector3(
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1
            );

            particles.add(feather);
        }

        // Add update function
        particles.birthTime = Date.now();
        particles.update = function(delta) {
            const age = Date.now() - this.birthTime;
            const lifespan = 2000; // 2 seconds

            if (age > lifespan) {
                return true; // Remove particles
            }

            // Update each feather
            this.children.forEach(feather => {
                // Update position
                feather.position.add(feather.velocity);
                feather.velocity.y -= 0.001 * delta; // Gravity

                // Update rotation
                feather.rotation.x += feather.rotationSpeed.x * delta;
                feather.rotation.y += feather.rotationSpeed.y * delta;
                feather.rotation.z += feather.rotationSpeed.z * delta;

                // Slow down rotation
                feather.rotationSpeed.multiplyScalar(0.98);

                // Fade out
                feather.material.opacity = 1 - (age / lifespan);
            });

            return false;
        };

        this.engine.scene.add(particles);
        this.activeParticleSystems.push(particles);
    }

    startSpawning() {
        console.debug('[BIRDMANAGER] Starting bird spawning');
        this.isSpawning = true;
        // Reset spawn timer to allow immediate spawn
        this.lastSpawnTime = 0;
        // If we're not the host, we should still spawn some initial birds
        if (this.engine.networkManager && !this.engine.networkManager.isHost) {
            console.debug('[BIRDMANAGER] Client spawning initial birds');
            const initialBirdsToSpawn = Math.min(2, this.maxBirds);
            for (let i = 0; i < initialBirdsToSpawn; i++) {
                this.spawnBird();
            }
        }
        console.debug('[BIRDMANAGER] Bird spawning started. Is Host:', this.engine.networkManager?.isHost);
    }

    stopSpawning() {
        console.debug('[BIRDMANAGER] Stopping bird spawning');
        this.isSpawning = false;
        console.log('[DEBUG] Bird spawning stopped');
    }
}
