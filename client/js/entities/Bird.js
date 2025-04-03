import * as THREE from 'three';

export class Bird extends THREE.Group {
    constructor(position, direction, movementData) {
        super();
        this.position.copy(position);
        this.direction = direction.clone();
        this.spawnTime = Date.now();
        this.lifeTime = 0;
        this.maxLifeTime = 25000; // 25 seconds
        this.birdManager = null;
        
        // Store received movement data or generate new if not provided
        this.movementData = movementData || {
            speed: THREE.MathUtils.randFloat(0.3, 0.6),
            patternType: Math.floor(Math.random() * 3),
            patternScale: THREE.MathUtils.randFloat(0.5, 1.5),
            patternPhase: Math.random() * Math.PI * 2,
            timeOffset: Math.random() * 1000,
            directionX: THREE.MathUtils.randFloatSpread(0.5),
            directionZ: THREE.MathUtils.randFloatSpread(0.5)
        };
        
        // Store initial position
        this.initialPosition = position.clone();
        this.currentPosition = position.clone();
        
        // Ensure visible
        this.visible = true;
        
        // Create simple bright ball
        this.createSimpleBall();
        
        // Set bounding box for collision detection
        this.boundingBox = new THREE.Box3();
        this.updateBoundingBox();
        
        // Create a trail effect
        this.createTrailEffect(position);
        
        console.log('[BIRD] Bird created with mesh count:', this.children.length);
    }
    
    createSimpleBall() {
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
        this.mesh.visible = true;
        this.add(this.mesh);
        
        // Store the material for animation updates
        this.material = material;
    }
    
    createTrailEffect(position) {
        this.trailLength = 5;
        this.trailPoints = [];
        for (let i = 0; i < this.trailLength; i++) {
            this.trailPoints.push(position.clone());
        }
        
        const trailGeometry = new THREE.BufferGeometry();
        const trailMaterial = new THREE.LineBasicMaterial({ 
            color: 0xffff00, 
            transparent: true, 
            opacity: 0.5
        });
        this.trail = new THREE.Line(trailGeometry, trailMaterial);
        this.updateTrailGeometry();
        this.add(this.trail);
    }
    
    updateTrailGeometry() {
        const positions = new Float32Array(this.trailPoints.length * 3);
        for (let i = 0; i < this.trailPoints.length; i++) {
            positions[i * 3] = this.trailPoints[i].x;
            positions[i * 3 + 1] = this.trailPoints[i].y;
            positions[i * 3 + 2] = this.trailPoints[i].z;
        }
        this.trail.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.trail.geometry.attributes.position.needsUpdate = true;
    }
    
    update(delta) {
        // Use absolute time since spawn for deterministic movement patterns
        this.lifeTime += delta * 1000;
        const elapsedSeconds = this.lifeTime / 1000;
        
        // Save the previous position before updating
        const prevPosition = this.position.clone();
        
        // Update position with simplified movement
        this.updatePosition(delta, elapsedSeconds);
        
        // Update trail
        this.trailPoints.pop();
        this.trailPoints.unshift(prevPosition);
        this.updateTrailGeometry();
        
        // Update holographic shader time
        if (this.material && this.material.uniforms) {
            this.material.uniforms.time.value += delta;
        }
        
        // Log position occasionally for debugging
        if (this.lifeTime % 1000 < 20) { // Log roughly every second
            console.log(`[BIRD] Position at ${Math.floor(this.lifeTime/1000)}s:`, 
                `[${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)}]`);
        }
        
        // Update bounding box
        this.updateBoundingBox();
        
        // Check if lifetime has expired
        if (this.lifeTime >= this.maxLifeTime) {
            return true; // True indicates this bird should be removed
        }
        
        return false;
    }
    
    updatePosition(delta, elapsedTime) {
        const { speed, patternType, patternScale, patternPhase } = this.movementData;
        
        // Base movement in the bird's direction
        const scaledDelta = delta * speed;
        const movement = new THREE.Vector3(
            this.movementData.directionX * scaledDelta,
            0,
            this.movementData.directionZ * scaledDelta
        );
        
        // Add pattern movement
        switch (patternType) {
            case 0: // Circular
                movement.x += Math.cos(elapsedTime * 2 + patternPhase) * patternScale * 0.03;
                movement.z += Math.sin(elapsedTime * 2 + patternPhase) * patternScale * 0.03;
                movement.y += Math.sin(elapsedTime * 1.2) * patternScale * 0.01;
                break;
                
            case 1: // Figure-8 pattern
                movement.x += Math.sin(elapsedTime * 1.5 + patternPhase) * patternScale * 0.04;
                movement.z += Math.sin(2 * (elapsedTime * 1.5 + patternPhase)) * patternScale * 0.02;
                movement.y += Math.cos(elapsedTime * 0.8 + patternPhase) * patternScale * 0.01;
                break;
                
            case 2: // Wave
                movement.x += (Math.sin(elapsedTime * 0.7 + patternPhase) * 0.3) * patternScale * 0.02;
                movement.z += Math.sin(elapsedTime * 1.3 + patternPhase) * patternScale * 0.03;
                movement.y += Math.cos(elapsedTime * 0.8) * patternScale * 0.015;
                break;
        }
        
        // Update position
        this.position.add(movement);
        
        // Keep position within a reasonable range
        const BOUNDS = {
            minX: -6, maxX: 6,       // 3x smaller (was -18/18)
            minY: 0.5, maxY: 5,      // Y-bounds remain the same
            minZ: -6, maxZ: 6        // 3x smaller (was -18/18)
        };
        
        // Soft boundary enforcement - gradually push back if near edges
        if (this.position.x < BOUNDS.minX + 2) {
            this.position.x += 0.02 * scaledDelta * 20;
            this.movementData.directionX = Math.abs(this.movementData.directionX); // Reverse direction
        } else if (this.position.x > BOUNDS.maxX - 2) {
            this.position.x -= 0.02 * scaledDelta * 20;
            this.movementData.directionX = -Math.abs(this.movementData.directionX); // Reverse direction
        }
        
        if (this.position.y < BOUNDS.minY) {
            this.position.y = BOUNDS.minY;
            this.movementData.directionY = Math.abs(this.movementData.directionY); // Bounce up
        } else if (this.position.y > BOUNDS.maxY) {
            this.position.y = BOUNDS.maxY;
            this.movementData.directionY = -Math.abs(this.movementData.directionY); // Bounce down
        }
        
        if (this.position.z < BOUNDS.minZ + 2) {
            this.position.z += 0.02 * scaledDelta * 20;
            this.movementData.directionZ = Math.abs(this.movementData.directionZ); // Reverse direction
        } else if (this.position.z > BOUNDS.maxZ - 2) {
            this.position.z -= 0.02 * scaledDelta * 20;
            this.movementData.directionZ = -Math.abs(this.movementData.directionZ); // Reverse direction
        }
    }

    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0;
    }

    updateBoundingBox() {
        if (this.mesh) {
            // Make sure the world matrix is updated
            this.mesh.updateMatrixWorld(true);
            
            // Compute the bounding box directly from mesh geometry in world space
            this.boundingBox = new THREE.Box3().setFromObject(this.mesh);
        }
    }
}
