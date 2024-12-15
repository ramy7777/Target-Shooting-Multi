import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class World {
    constructor(engine) {
        this.engine = engine;
        this.objects = new Set();
        this.clock = new THREE.Clock();
        this.materials = new Map(); // Store reusable materials
        this.setupEnvironment();
    }

    async setupEnvironment() {
        const platformRadius = 10;

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

        // Add a darker skybox
        const skyGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x1a1a2a,
            side: THREE.BackSide
        });
        this.materials.set('sky', skyMaterial);
        const skybox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.engine.scene.add(skybox);
        this.objects.add(skybox);

        // Add ambient lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        this.engine.scene.add(ambientLight);

        // Add central light
        const centralLight = new THREE.PointLight(0xffffff, 1, platformRadius * 4);
        centralLight.position.set(0, platformRadius, 0);
        this.engine.scene.add(centralLight);

        // Add accent lights around the platform
        const numLights = 6;
        for (let i = 0; i < numLights; i++) {
            const angle = (i / numLights) * Math.PI * 2;
            const x = Math.cos(angle) * (platformRadius - 1);
            const z = Math.sin(angle) * (platformRadius - 1);
            
            const light = new THREE.PointLight(0x4444ff, 0.5, platformRadius * 2);
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
        this.createHolographicRoom();
    }

    createHolographicRoom() {
        const roomWidth = 5;
        const roomHeight = 3;
        const roomDepth = 3;
        const roomY = 2; // 2 meters above floor level

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
                    float alpha = (gridPattern * pulse * edgeFade * 0.3) + border * 0.8;
                    
                    // Output final color with glow
                    vec3 glowColor = color + vec3(0.2) * gridPattern + vec3(0.5) * border;
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

        // Create edge lines
        const edges = [
            // Vertical edges
            { start: [-roomWidth/2, -roomHeight/2, roomDepth/2], end: [-roomWidth/2, roomHeight/2, roomDepth/2] },
            { start: [roomWidth/2, -roomHeight/2, roomDepth/2], end: [roomWidth/2, roomHeight/2, roomDepth/2] },
            { start: [-roomWidth/2, -roomHeight/2, -roomDepth/2], end: [-roomWidth/2, roomHeight/2, -roomDepth/2] },
            { start: [roomWidth/2, -roomHeight/2, -roomDepth/2], end: [roomWidth/2, roomHeight/2, -roomDepth/2] },
            
            // Horizontal edges - Top
            { start: [-roomWidth/2, roomHeight/2, roomDepth/2], end: [roomWidth/2, roomHeight/2, roomDepth/2] },
            { start: [-roomWidth/2, roomHeight/2, -roomDepth/2], end: [roomWidth/2, roomHeight/2, -roomDepth/2] },
            { start: [-roomWidth/2, roomHeight/2, roomDepth/2], end: [-roomWidth/2, roomHeight/2, -roomDepth/2] },
            { start: [roomWidth/2, roomHeight/2, roomDepth/2], end: [roomWidth/2, roomHeight/2, -roomDepth/2] },
            
            // Horizontal edges - Bottom
            { start: [-roomWidth/2, -roomHeight/2, roomDepth/2], end: [roomWidth/2, -roomHeight/2, roomDepth/2] },
            { start: [-roomWidth/2, -roomHeight/2, -roomDepth/2], end: [roomWidth/2, -roomHeight/2, -roomDepth/2] },
            { start: [-roomWidth/2, -roomHeight/2, roomDepth/2], end: [-roomWidth/2, -roomHeight/2, -roomDepth/2] },
            { start: [roomWidth/2, -roomHeight/2, roomDepth/2], end: [roomWidth/2, -roomHeight/2, -roomDepth/2] }
        ];

        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        edges.forEach(edge => {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(...edge.start),
                new THREE.Vector3(...edge.end)
            ]);
            const line = new THREE.Line(geometry, edgeMaterial);
            line.renderOrder = 2;
            roomGroup.add(line);
        });

        this.engine.scene.add(roomGroup);
        this.holographicRoom = roomGroup;

        // Update shader time in the render loop
        const updateShaderTime = () => {
            roomGroup.children.forEach(mesh => {
                if (mesh.material && mesh.material.uniforms) {
                    mesh.material.uniforms.time.value = this.clock.getElapsedTime();
                }
            });
        };

        // Add the update function to the world's update method
        this.shaderTimeUpdate = updateShaderTime;
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
        // Update shader time for holographic effects
        if (this.shaderTimeUpdate) {
            this.shaderTimeUpdate();
        }
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
