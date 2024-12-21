import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export class World {
    constructor(engine) {
        this.engine = engine;
        this.clock = new THREE.Clock();
        this.ground = null;
        this.platform = null;
        this.setupGround();
        this.setupPlatform();
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
        // Create a semi-transparent platform 1 unit above the ground
        const platformGeometry = new THREE.BoxGeometry(3.3, 0.05, 3.3); // Reduced from 10x10 to 3.3x3.3
        const platformMaterial = new THREE.MeshPhongMaterial({
            color: 0x44ccff,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.platform = new THREE.Mesh(platformGeometry, platformMaterial);
        this.platform.position.y = 1; // 1 unit above ground
        this.engine.scene.add(this.platform);
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
            console.log('[WORLD] Loading skybox...');
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
            
            console.log('[WORLD] Skybox loaded successfully');
        } catch (error) {
            console.error('[WORLD] Error loading skybox:', error);
        }
    }

    update(deltaTime) {
        if (this.engine.xrSession) {
            // Handle AR mode differently
            if (this.engine.xrMode === 'immersive-ar') {
                // Adjust camera height in AR mode
                if (this.engine.camera) {
                    this.engine.camera.position.y = 1.0;
                }

                // Make platform and ground semi-transparent in AR
                if (this.platform) {
                    this.platform.visible = true;
                    this.platform.material.opacity = 0.3;
                }

                // Keep ground visible but make it semi-transparent
                if (this.ground) {
                    this.ground.visible = true;
                    if (this.ground.material) {
                        this.ground.material.transparent = true;
                        this.ground.material.opacity = 0.3;
                        this.ground.material.depthWrite = false;
                    }
                }
            } else {
                // Reset camera height for VR mode
                if (this.engine.camera) {
                    this.engine.camera.position.y = 0;
                }

                // Reset platform visibility for VR mode
                if (this.platform) {
                    this.platform.visible = true;
                    this.platform.material.opacity = 0.5;
                }

                // Reset ground visibility for VR mode
                if (this.ground) {
                    this.ground.visible = true;
                    if (this.ground.material) {
                        this.ground.material.transparent = false;
                        this.ground.material.opacity = 1;
                        this.ground.material.depthWrite = true;
                    }
                }
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
        // Dispose geometries and materials
        if (this.ground && this.ground.geometry) this.ground.geometry.dispose();
        if (this.platform && this.platform.geometry) this.platform.geometry.dispose();
    }
}
