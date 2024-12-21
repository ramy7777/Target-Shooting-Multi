import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { Ball } from '../entities/Ball.js';
import { Paddle } from '../entities/Paddle.js';

export class World {
    constructor(engine) {
        this.engine = engine;
        this.clock = new THREE.Clock();
        this.ground = null;
        this.platform = null;
        this.ball = null;
        this.leftPaddle = null;
        this.rightPaddle = null;
        this.ballSyncInterval = null;
        this.setupGround();
        this.setupPlatform();
        this.setupPaddles();
    }

    setupGround() {
        // Create fallback ground
        const groundSize = 40;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a3a4a,
            roughness: 0.4,
            metalness: 0.6
        });

        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.engine.scene.add(this.ground);
    }

    setupPlatform() {
        // Create a semi-transparent platform 0.65 units above the ground
        // Width: 1.65 * 0.8 = 1.32 (20% reduction)
        // Length: 1.65 * 1.3 = 2.145 (30% increase)
        const platformGeometry = new THREE.BoxGeometry(1.32, 0.05, 2.145);
        const platformMaterial = new THREE.MeshPhongMaterial({
            color: 0x44ccff,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.platform = new THREE.Mesh(platformGeometry, platformMaterial);
        this.platform.position.y = 0.65; // Lowered from 0.7 to 0.65
        this.platform.rotation.y = Math.PI / 2; // Rotated 90 degrees
        this.engine.scene.add(this.platform);
    }

    setupPaddles() {
        // Create left and right paddles
        this.leftPaddle = new Paddle(this.engine, true);
        this.rightPaddle = new Paddle(this.engine, false);
    }

    async setupEnvironment() {
        await this.loadSkybox();

        const platformRadius = 10;

        // Minimal ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.05); // Drastically reduced from 0.2 to 0.05
        this.engine.scene.add(ambientLight);

        // Very dim central light
        const centralLight = new THREE.DirectionalLight(0xffffff, 0.1); // Reduced from 0.3 to 0.1
        centralLight.position.set(0, 10, 0);
        this.engine.scene.add(centralLight);

        // Create circular platform texture with fade
        const textureSize = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = textureSize;
        canvas.height = textureSize;
        const ctx = canvas.getContext('2d');

        // Create radial gradient for the fade effect
        const gradient = ctx.createRadialGradient(
            textureSize/2, textureSize/2, 0,
            textureSize/2, textureSize/2, textureSize/2
        );
        gradient.addColorStop(0, '#3a3a4a');
        gradient.addColorStop(0.7, '#3a3a4a');
        gradient.addColorStop(1, 'transparent');

        // Fill the circle with gradient
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(textureSize/2, textureSize/2, textureSize/2, 0, Math.PI * 2);
        ctx.fill();

        // Add subtle circular grid lines
        ctx.strokeStyle = '#4444ff';
        for (let radius = platformRadius * 20; radius > 0; radius -= 20) {
            ctx.beginPath();
            ctx.arc(textureSize/2, textureSize/2, radius, 0, Math.PI * 2);
            ctx.globalAlpha = 0.1 * (radius / (platformRadius * 20));
            ctx.stroke();
        }

        const platformTexture = new THREE.CanvasTexture(canvas);

        // Create the circular platform
        const platformGeometry = new THREE.CircleGeometry(platformRadius, 64);
        const platformMaterial = new THREE.MeshStandardMaterial({
            map: platformTexture,
            transparent: true,
            roughness: 0.4,
            metalness: 0.6,
            emissive: new THREE.Color(0x1111ff),
            emissiveIntensity: 0.1
        });

        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.rotation.x = -Math.PI / 2;
        platform.position.y = 0;
        this.engine.scene.add(platform);

        // Add a grid helper that matches the platform size
        const gridHelper = new THREE.GridHelper(platformRadius * 2, 20, 0x0000ff, 0x404040);
        gridHelper.position.y = 0.01;
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        this.engine.scene.add(gridHelper);

        // Add accent lights around the platform
        const numLights = 6;
        for (let i = 0; i < numLights; i++) {
            const angle = (i / numLights) * Math.PI * 2;
            const x = Math.cos(angle) * (platformRadius - 1);
            const z = Math.sin(angle) * (platformRadius - 1);
            
            const light = new THREE.PointLight(0x4444ff, 0.05, platformRadius * 2); // Reduced from 0.2 to 0.05
            light.position.set(x, 2, z);
            this.engine.scene.add(light);
        }

        // Add a subtle glow effect around the platform
        const glowGeometry = new THREE.RingGeometry(platformRadius, platformRadius + 1, 64);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x0033ff,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        
        const glowRing = new THREE.Mesh(glowGeometry, glowMaterial);
        glowRing.rotation.x = -Math.PI / 2;
        glowRing.position.y = 0.02;
        this.engine.scene.add(glowRing);
    }

    async loadSkybox() {
        try {
            const loader = new EXRLoader();
            const texture = await loader.loadAsync('/assets/textures/skybox/overcast_soil_puresky_1k.exr');
            
            // Configure texture
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.encoding = THREE.LinearEncoding;
            
            // Reduce the intensity of the environment lighting
            const pmremGenerator = new THREE.PMREMGenerator(this.engine.renderer);
            pmremGenerator.compileEquirectangularShader();
            
            const envMap = pmremGenerator.fromEquirectangular(texture);
            const scaledTexture = texture.clone();
            scaledTexture.intensity = 0.05; // Drastically reduced from 0.1 to 0.05
            
            // Set scene background and environment
            this.engine.scene.background = scaledTexture;
            this.engine.scene.environment = envMap.texture;
            this.engine.scene.environment.intensity = 3.0; // Doubled from 1.5
            
            // Change to ReinhardToneMapping with very low exposure
            this.engine.renderer.toneMapping = THREE.ReinhardToneMapping;
            this.engine.renderer.toneMappingExposure = 0.1; // Drastically reduced from 0.3 to 0.1
            
            texture.dispose();
            pmremGenerator.dispose();
        } catch (error) {
            console.error('[WORLD] Error loading skybox:', error);
        }
    }

    startGame() {
        if (!this.ball) {
            this.ball = new Ball(this.engine);
            this.ball.reset();
            
            // Add ball to scene
            this.engine.scene.add(this.ball.mesh);
            
            // Only host broadcasts ball spawn
            if (this.engine.networkManager?.isHost) {
                const spawnData = {
                    position: this.ball.mesh.position.toArray(),
                    direction: this.ball.direction.toArray(),
                    speed: this.ball.speed
                };
                this.engine.networkManager.send({
                    type: 'ballSpawned',
                    data: spawnData,
                    senderId: this.engine.networkManager.localPlayerId
                });
            }
        }
    }

    handleBallSpawn(data) {
        if (!this.ball) {
            this.ball = new Ball(this.engine);
            
            // Set ball properties
            this.ball.mesh.position.fromArray(data.position);
            this.ball.direction.fromArray(data.direction);
            this.ball.speed = data.speed;
            
            // Add ball to scene
            this.engine.scene.add(this.ball.mesh);
        }
    }

    handleBallState(data) {
        if (!this.ball) return;
        this.ball.mesh.position.fromArray(data.position);
        this.ball.direction.fromArray(data.direction);
        this.ball.speed = data.speed;
    }

    update(deltaTime) {
        if (this.engine.xrSession) {
            this.handleARMode();
        } else {
            this.handleNonARMode();
        }

        // Update ball if it exists
        if (this.ball) {
            // Check paddle collisions before updating ball position
            if (this.leftPaddle) this.leftPaddle.checkBallCollision(this.ball);
            if (this.rightPaddle) this.rightPaddle.checkBallCollision(this.ball);
            
            // Only host updates ball physics
            if (this.engine.networkManager?.isHost) {
                this.ball.update(deltaTime);
                this.sendBallUpdate();
            }
        }

        // Update paddles
        if (this.leftPaddle) this.leftPaddle.update(deltaTime);
        if (this.rightPaddle) this.rightPaddle.update(deltaTime);
    }

    sendBallUpdate() {
        if (!this.ball || !this.engine.networkManager) return;
        
        this.engine.networkManager.send({
            type: 'ballState',
            data: {
                position: this.ball.mesh.position.toArray(),
                direction: this.ball.direction.toArray(),
                speed: this.ball.speed
            },
            senderId: this.engine.networkManager.localPlayerId
        });
    }

    handleBallState(data) {
        if (!this.ball) return;
        
        // Update ball state from network data
        this.ball.mesh.position.fromArray(data.position);
        this.ball.direction.fromArray(data.direction);
        this.ball.speed = data.speed;
    }

    handleARMode() {
        // Adjust camera height in AR mode
        if (this.engine.camera) {
            this.engine.camera.position.y = 1.0;
        }

        // Make platform visible but semi-transparent in AR
        if (this.platform) {
            this.platform.visible = true;
            this.platform.material.opacity = 0.3;
        }

        // Hide ground in AR mode
        if (this.ground) {
            this.ground.visible = false;
        }
    }

    handleNonARMode() {
        // Reset camera height for VR mode
        if (this.engine.camera) {
            this.engine.camera.position.y = 0;
        }

        // Reset platform visibility for VR mode
        if (this.platform) {
            this.platform.visible = true;
            this.platform.material.opacity = 0.5;
        }

        // Show ground in VR mode
        if (this.ground) {
            this.ground.visible = true;
            if (this.ground.material) {
                this.ground.material.transparent = false;
                this.ground.material.opacity = 1;
                this.ground.material.depthWrite = true;
            }
        }
    }

    createBird() {
        const geometry = new THREE.SphereGeometry(0.2, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: 0x000066,
            emissive: 0x000033,
            emissiveIntensity: 0.15, // Increased from 0.1
            transparent: true,
            opacity: 0.4, // Increased from 0.3
            metalness: 0.9,
            roughness: 0.7 // Slightly decreased from 0.8 for more reflection
        });
    }

    addGlowingEdges() {
        // This method is no longer needed
    }

    addFuturisticWalls() {
        // This method is no longer needed
    }

    createFallbackGround() {
        // This is now just a backup in case something goes wrong
        const groundSize = 40;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a3a4a,
            roughness: 0.4,
            metalness: 0.6
        });

        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.engine.scene.add(this.ground);
    }

    highlightObject(object, highlight) {
        if (object && object.userData.isInteractive) {
            if (highlight) {
                object.material.emissive.setHex(0xff0000);
                object.scale.setScalar(1.2);
            } else {
                object.material.emissive.setHex(0x222222);
                object.scale.setScalar(1.0);
            }
        }
    }

    cleanup() {
        this.stopBallSync();
        // Dispose geometries and materials
        if (this.ground && this.ground.geometry) this.ground.geometry.dispose();
        if (this.platform && this.platform.geometry) this.platform.geometry.dispose();
        if (this.ball) {
            this.ball.dispose();
            this.ball = null;
        }
        if (this.leftPaddle) {
            this.leftPaddle.dispose();
            this.leftPaddle = null;
        }
        if (this.rightPaddle) {
            this.rightPaddle.dispose();
            this.rightPaddle = null;
        }
    }
}
