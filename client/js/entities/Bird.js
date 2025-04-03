import * as THREE from 'three';

export class Bird extends THREE.Object3D {
    constructor(position = new THREE.Vector3(), direction = new THREE.Vector3(1, 0, 0)) {
        super();
        
        // Create a holographic sphere with room-matching material
        const geometry = new THREE.SphereGeometry(0.075, 32, 32);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0x00bb33) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;
                
                void main() {
                    vUv = uv;
                    vPosition = position;
                    vNormal = normalize(normalMatrix * normal);
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                // Hexagonal pattern function
                float hexagonalPattern(vec2 p, float scale) {
                    p *= scale;
                    vec2 h = vec2(0.5, 0.866025404); // sqrt(3)/2 for hexagon
                    vec2 a = mod(p, h * 2.0) - h;
                    vec2 b = mod(p + h, h * 2.0) - h;
                    return min(dot(a, a), dot(b, b));
                }
                
                vec2 sphereToTriplanar(vec3 normal) {
                    vec3 absNormal = abs(normal);
                    vec2 uv;
                    
                    // Choose the dominant axis
                    if (absNormal.x > absNormal.y && absNormal.x > absNormal.z) {
                        uv = vWorldPosition.zy;
                    } else if (absNormal.y > absNormal.z) {
                        uv = vWorldPosition.xz;
                    } else {
                        uv = vWorldPosition.xy;
                    }
                    
                    // Scale UV and add slower time-based movement
                    return uv * 0.5 + vec2(time * 0.05);
                }
                
                void main() {
                    // Get UV coordinates based on world position
                    vec2 triplanarUV = sphereToTriplanar(vNormal);
                    
                    // Create hexagonal patterns at different scales
                    float hex1 = smoothstep(0.05, 0.1, hexagonalPattern(triplanarUV, 8.0));
                    float hex2 = smoothstep(0.05, 0.1, hexagonalPattern(triplanarUV, 16.0)) * 0.5;
                    
                    // Combine patterns
                    float pattern = hex1 + hex2;
                    
                    // Subtle pulse effect
                    float pulse = sin(time * 1.5) * 0.05 + 0.95;
                    
                    // Improved rim lighting with angle-independent component
                    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
                    float rim = pow(1.0 - max(dot(viewDirection, vNormal), 0.0), 2.0);
                    rim = smoothstep(0.3, 1.0, rim);
                    
                    // Ensure minimum visibility regardless of angle
                    float viewAngle = abs(dot(viewDirection, vNormal));
                    float angleVisibility = max(0.7, viewAngle); // Minimum 0.7 visibility
                    
                    // Higher base visibility with guaranteed minimum
                    float baseVisibility = max(0.4, 0.35 * (1.0 + (1.0 - viewAngle) * 0.8));
                    
                    // Calculate final alpha with guaranteed minimum visibility
                    float alpha = max(0.3, (pattern * pulse * 0.3 + rim * 0.2 + baseVisibility) * 0.6 * angleVisibility);
                    
                    // Enhanced glow color with stronger base emission
                    vec3 glowColor = color * 1.2 + vec3(0.15) * pattern + vec3(0.2) * rim + vec3(0.15);
                    gl_FragColor = vec4(glowColor, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: true,
            depthTest: true,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.add(this.mesh);
        
        // Store the material for animation updates
        this.material = material;

        // Set initial position
        this.position.copy(position);
        this.spawnTime = Date.now();
        this.lifespan = 40000; // 40 seconds lifespan
        
        // Initialize movement parameters
        this.initialPosition = position.clone();
        this.movementSpeed = THREE.MathUtils.randFloat(0.3, 0.6); // Restored to original speed
        this.patternType = Math.floor(Math.random() * 3); // 0: Circular, 1: Figure-8, 2: Sine wave
        this.patternScale = THREE.MathUtils.randFloat(0.5, 1.5); // Restored to original scale
        this.patternPhase = Math.random() * Math.PI * 2;
        this.timeOffset = Math.random() * 1000;
        
        // Movement direction - restored to original spread
        this.movementDirection = new THREE.Vector3(
            THREE.MathUtils.randFloatSpread(0.5),
            0,
            THREE.MathUtils.randFloatSpread(0.5)
        ).normalize();
        
        // Set bounding box for collision detection
        this.boundingBox = new THREE.Box3();
        this.updateBoundingBox();
    }

    update(deltaTime) {
        const currentTime = Date.now();
        const elapsedTime = (currentTime - this.spawnTime + this.timeOffset) / 1000; // In seconds

        // Check lifespan
        if (currentTime - this.spawnTime > this.lifespan) {
            return true; // Bird should be removed
        }

        // Update holographic effect time
        if (this.material && this.material.uniforms) {
            this.material.uniforms.time.value += deltaTime;
        }
        
        // Apply movement pattern based on pattern type
        this.applyMovementPattern(elapsedTime);
        
        // Update bounding box
        this.updateBoundingBox();

        return false;
    }
    
    applyMovementPattern(elapsedTime) {
        // Calculate normalized time for patterns (0 to 1, cycles over time)
        const t = elapsedTime * this.movementSpeed;
        
        // Start with the initial position
        const newPosition = this.initialPosition.clone();
        
        switch(this.patternType) {
            case 0: // Circular pattern
                const radius = this.patternScale;
                const circleX = Math.cos(t + this.patternPhase) * radius;
                const circleZ = Math.sin(t + this.patternPhase) * radius;
                newPosition.x += circleX;
                newPosition.z += circleZ;
                break;
                
            case 1: // Figure-8 pattern
                const scale = this.patternScale * 1.2; // Restored original multiplier
                const figureX = Math.sin(t + this.patternPhase) * scale;
                const figureZ = Math.sin(2 * (t + this.patternPhase)) * scale * 0.5; // Restored original value
                newPosition.x += figureX;
                newPosition.z += figureZ;
                break;
                
            case 2: // Sine wave pattern with horizontal movement
                const waveScale = this.patternScale;
                const baseOffset = t * 0.5; // Restored original movement speed
                const verticalOffset = Math.sin(t * 2 + this.patternPhase) * waveScale * 0.3; // Restored original values
                newPosition.x += this.movementDirection.x * baseOffset;
                newPosition.y += verticalOffset;
                newPosition.z += this.movementDirection.z * baseOffset;
                break;
        }
        
        // Update the bird's position
        this.position.copy(newPosition);
    }

    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0;
    }

    updateBoundingBox() {
        if (this.mesh) {
            this.mesh.geometry.computeBoundingBox();
            const meshBox = this.mesh.geometry.boundingBox.clone();
            meshBox.applyMatrix4(this.mesh.matrixWorld);
            this.boundingBox.copy(meshBox);
        }
    }
}
