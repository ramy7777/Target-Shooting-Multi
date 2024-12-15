import { Bullet } from '../entities/Bullet.js';
import * as THREE from 'three';
import AudioManager from './AudioManager.js';  // Changed to default import

export class BulletManager {
    constructor(engine) {
        this.engine = engine;
        this.bullets = new Set();
        this.lastTriggerState = [false, false];
        
        // Meta Quest 3 Button Mapping (same as InputManager)
        this.QUEST3_MAPPING = {
            buttons: {
                trigger: 0,    // Index finger trigger
                grip: 1,       // Hand grip
                menu: 2,       // Menu button (left controller only)
                thumbstick: 3, // Thumbstick press
                X_A: 4,        // X button (left) or A button (right)
                Y_B: 5         // Y button (left) or B button (right)
            }
        };

        // Initialize audio manager
        this.audioManager = new AudioManager();
    }

    update() {
        // Handle VR input if in VR mode
        if (this.engine.renderer.xr.isPresenting) {
            this.handleVRInput();
        }

        // Update all bullets regardless of VR mode
        for (const bullet of this.bullets) {
            // Update bullet using its update method
            if (bullet.update()) {
                this.removeBullet(bullet);
                continue;
            }

            // Check if bullet hit a bird
            if (this.engine.birdManager && this.engine.birdManager.handleBulletCollision(bullet)) {
                this.removeBullet(bullet);
                continue;
            }

            // Check if bullet is out of bounds
            if (Math.abs(bullet.position.x) > 50 ||
                Math.abs(bullet.position.y) > 50 ||
                Math.abs(bullet.position.z) > 50) {
                this.removeBullet(bullet);
            }
        }
    }

    handleVRInput() {
        const session = this.engine.renderer.xr.getSession();
        if (!session) {
            return;
        }

        const inputSources = session.inputSources;
        if (!inputSources || inputSources.length === 0) {
            return;
        }

        // Process each input source (controller)
        inputSources.forEach((inputSource, i) => {
            if (!inputSource.gamepad) {
                return;
            }

            const controller = this.engine.inputManager.controllers[i];
            if (!controller) {
                return;
            }

            const gamepad = inputSource.gamepad;
            const triggerButton = gamepad.buttons[this.QUEST3_MAPPING.buttons.trigger];

            if (triggerButton.pressed && !this.lastTriggerState[i]) {
                this.createBullet(controller, null, 0.3); // Set bullet speed to 0.3
            }
            this.lastTriggerState[i] = triggerButton.pressed;
        });
    }

    createBullet(controllerOrPosition, optionalDirection, speed = 1.0) {
        let position, direction;

        if (controllerOrPosition instanceof THREE.Vector3) {
            position = controllerOrPosition.clone();
            direction = optionalDirection.clone().normalize();
        } else {
            const controllerMatrix = controllerOrPosition.matrixWorld;
            position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            direction = new THREE.Vector3(0, 0, -1); // Forward direction
            
            position.setFromMatrixPosition(controllerMatrix);
            quaternion.setFromRotationMatrix(controllerMatrix);
            direction.applyQuaternion(quaternion).normalize();
        }
        
        // Create bullet
        const bullet = new Bullet(position, direction, speed);
        bullet.shooterId = this.engine.networkManager.localPlayerId;
        bullet.scale.set(0.1, 0.1, 0.1);
        this.engine.scene.add(bullet);
        this.bullets.add(bullet);

        // Play shooting sound locally
        this.audioManager.playRifleShot();

        // Send bullet creation event to network
        if (this.engine.networkManager) {
            this.engine.networkManager.send({
                type: 'bulletSpawned',
                data: {
                    position: position.toArray(),
                    direction: direction.toArray(),
                    speed: speed,
                    shooterId: bullet.shooterId,
                    playSound: true // Add flag to indicate sound should be played
                }
            });
        }

        return bullet;
    }

    handleNetworkBulletSpawn(data, senderId) {
        // Don't spawn bullets for our own shots since we already have them
        if (senderId === this.engine.networkManager.localPlayerId) {
            return;
        }

        console.debug('[DEBUG] Spawning network bullet from player:', senderId, data);
        const position = new THREE.Vector3().fromArray(data.position);
        const direction = new THREE.Vector3().fromArray(data.direction);
        const bullet = new Bullet(position, direction, data.speed);
        bullet.shooterId = data.shooterId;
        bullet.scale.set(0.1, 0.1, 0.1);
        this.engine.scene.add(bullet);
        this.bullets.add(bullet);

        // Play shooting sound for network bullets
        if (data.playSound) {
            this.audioManager.playRifleShot();
        }
    }

    removeBullet(bullet) {
        this.engine.scene.remove(bullet);
        this.bullets.delete(bullet);
    }
}
