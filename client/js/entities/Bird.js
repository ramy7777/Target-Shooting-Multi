import * as THREE from 'three';

export class Bird extends THREE.Object3D {
    constructor(position = new THREE.Vector3(), direction = new THREE.Vector3(1, 0, 0)) {
        super();
        
        // Create a holographic sphere with room-matching material
        const geometry = new THREE.SphereGeometry(0.075, 32, 32);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0x00ff44) }
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
                    
                    // Improved rim lighting
                    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
                    float rim = pow(1.0 - max(dot(viewDirection, vNormal), 0.0), 2.0);
                    rim = smoothstep(0.3, 1.0, rim);
                    
                    // Higher base visibility
                    float baseVisibility = 0.5;
                    
                    // Calculate final alpha with more stability
                    float alpha = (pattern * pulse * 0.4 + rim * 0.3 + baseVisibility) * 0.9;
                    
                    // Enhanced glow color with better balance
                    vec3 glowColor = color + vec3(0.2) * pattern + vec3(0.3) * rim;
                    gl_FragColor = vec4(glowColor, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.add(this.mesh);
        
        // Store the material for animation updates
        this.material = material;

        // Set initial position
        this.position.copy(position);
        this.spawnTime = Date.now();
        this.lifespan = 50000; // 50 seconds lifespan

        // Set up collision box
        this.boundingBox = new THREE.Box3();
        this.updateBoundingBox();
    }

    update(deltaTime) {
        const currentTime = Date.now();

        // Check lifespan
        if (currentTime - this.spawnTime > this.lifespan) {
            return true; // Bird should be removed
        }

        // Update holographic effect time
        if (this.material && this.material.uniforms) {
            this.material.uniforms.time.value += deltaTime;
        }
        
        // Update bounding box
        this.updateBoundingBox();

        return false;
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
