import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export class World {
    constructor(engine) {
        this.engine = engine;
        this.objects = new Set();
        this.clock = new THREE.Clock();
        this.materials = new Map(); // Store reusable materials
        this.gltfLoader = new GLTFLoader(); // Add GLTFLoader instance
        this.setupEnvironment();
    }

    async setupEnvironment() {
        await this.loadSkybox();
        await this.loadPlatformModel(); // Add platform model loading

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
        this.ground = platform;
        this.objects.add(platform);

        // Add a grid helper that matches the platform size
        const gridHelper = new THREE.GridHelper(platformRadius * 2, 20, 0x0000ff, 0x404040);
        gridHelper.position.y = 0.01;
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        this.engine.scene.add(gridHelper);
        this.objects.add(gridHelper);

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
        this.objects.add(glowRing);

        // Create holographic room
        // this.createHolographicRoom();
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

    async loadPlatformModel() {
        try {
            console.log('[WORLD] Loading platform model...');
            const gltf = await this.gltfLoader.loadAsync('/assets/models/platform/base_basic_pbr.glb');
            const platform = gltf.scene;
            
            // Keep the same scale as before (1.52)
            platform.scale.set(1.52, 1.52, 1.52);
            
            // Keep the same floor-level position
            platform.position.set(0, 0, 0);
            
            // Keep the same rotations
            platform.rotation.x = -Math.PI / 2;  // Lie flat
            platform.rotation.y = Math.PI / 2;   // 90 degrees Y rotation
            platform.rotation.z = Math.PI / 2;   // 90 degrees Z rotation
            
            this.engine.scene.add(platform);
            console.log('[WORLD] Platform model loaded successfully');
            
            // Calculate platform size
            const boundingBox = new THREE.Box3().setFromObject(platform);
            const size = boundingBox.getSize(new THREE.Vector3());
            
            // Create holographic room based on platform size
            this.createHolographicRoom(size.x, size.z);
            
            // Apply materials and enable shadows
            platform.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Enhance the blue material properties
                    if (child.material) {
                        child.material.metalness = 0.8;  // More metallic look
                        child.material.roughness = 0.2;  // More shiny
                        child.material.envMapIntensity = 1.5;  // Stronger reflections
                    }
                }
            });
        } catch (error) {
            console.error('[WORLD] Error loading platform model:', error);
        }
    }

    createHolographicRoom(platformWidth = 5, platformDepth = 3) {
        // Make room slightly larger than platform
        const roomWidth = platformWidth * 1.2;  // 20% larger than platform
        const roomDepth = platformDepth * 1.2;  // 20% larger than platform
        const roomHeight = Math.max(roomWidth, roomDepth) * 0.8;  // Height proportional to width/depth
        const roomY = (roomHeight / 2) + 0.05; // Center the room vertically and raise by 0.05 meters

        // Create grid material with custom shader for holographic effect
        const gridMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0x00ffff) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                void main() {
                    vUv = uv;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;
                varying vec3 vPosition;
                
                float getGrid(vec2 uv, float size) {
                    vec2 grid = abs(fract(uv * size) - 0.5) * 2.0;
                    float lineWidth = 0.05;
                    vec2 lines = smoothstep(1.0 - lineWidth, 1.0, grid);
                    return max(lines.x, lines.y) * 0.5;
                }
                
                float getBorder(vec2 uv, float thickness) {
                    vec2 border = step(thickness, uv) * step(thickness, 1.0 - uv);
                    return 1.0 - (border.x * border.y);
                }
                
                void main() {
                    // Create multiple grid layers
                    float grid1 = getGrid(vUv, 10.0); // Large grid
                    float grid2 = getGrid(vUv, 50.0) * 0.5; // Fine grid
                    
                    // Combine grids
                    float gridPattern = grid1 + grid2;
                    
                    // Add subtle pulse effect
                    float pulse = sin(time * 2.0) * 0.1 + 0.9;
                    
                    // Add distance fade but preserve edges
                    float edgeFade = 1.0 - max(
                        abs(vUv.x - 0.5) * 2.0,
                        abs(vUv.y - 0.5) * 2.0
                    );
                    edgeFade = smoothstep(0.0, 0.3, edgeFade);
                    
                    // Add sharp border
                    float border = getBorder(vUv, 0.02);
                    
                    // Calculate final alpha
                    float alpha = (gridPattern * pulse * edgeFade * 0.15) + border * 0.4; // Increased from 0.1 and 0.3
                    
                    // Output final color with glow
                    vec3 glowColor = color + vec3(0.15) * gridPattern + vec3(0.3) * border; // Increased from 0.1 and 0.2
                    gl_FragColor = vec4(glowColor, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Create room faces
        const faces = [
            new THREE.PlaneGeometry(roomWidth, roomHeight), // Front
            new THREE.PlaneGeometry(roomWidth, roomHeight), // Back
            new THREE.PlaneGeometry(roomWidth, roomDepth),  // Bottom
            new THREE.PlaneGeometry(roomWidth, roomDepth)   // Top
        ];

        const positions = [
            [0, 0, roomDepth/2 + 0.001],           // Front
            [0, 0, -roomDepth/2 - 0.001],          // Back
            [0, -roomHeight/2, 0],                 // Bottom
            [0, roomHeight/2 + 0.001, 0]           // Top
        ];

        const rotations = [
            [0, 0, 0],                     // Front
            [0, Math.PI, 0],               // Back
            [Math.PI/2, 0, 0],             // Bottom
            [-Math.PI/2, 0, 0]             // Top
        ];

        // Create room group
        const roomGroup = new THREE.Group();
        roomGroup.position.y = roomY;

        // Create each face with its own material instance
        faces.forEach((geometry, index) => {
            const faceMaterial = gridMaterial.clone();
            const mesh = new THREE.Mesh(geometry, faceMaterial);
            mesh.position.set(...positions[index]);
            mesh.rotation.set(...rotations[index]);
            mesh.renderOrder = index + 1;
            roomGroup.add(mesh);
        });

        this.engine.scene.add(roomGroup);
        this.holographicRoom = roomGroup;

        // Add animation to update shader time
        this.engine.animationManager.addAnimation(() => {
            roomGroup.children.forEach(mesh => {
                if (mesh.material.uniforms) {
                    mesh.material.uniforms.time.value = this.clock.getElapsedTime();
                }
            });
        });
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
        this.materials.set('ground', groundMaterial);

        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        this.engine.scene.add(ground);
        this.ground = ground;
        this.objects.add(ground);
    }

    update() {
        // No shader updates needed for GLB model
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
        this.objects.forEach(object => {
            if (object.geometry) object.geometry.dispose();
        });
        
        this.materials.forEach(material => {
            material.dispose();
        });
        
        // Clear references
        this.objects.clear();
        this.materials.clear();
    }
}
