import * as THREE from 'three';

export class HolographicBall extends THREE.Object3D {
    constructor(position = new THREE.Vector3(), direction = new THREE.Vector3(1, 0, 0)) {
        super();
        
        // Store initial spawn data for network sync
        this.initialPosition = position.clone();
        this.initialDirection = direction.clone().normalize();
        
        // Movement properties
        this.position.copy(position);
        this.direction = direction.normalize();
        this.health = 25; // Starting with 50% health so it dies in one hit
        this.spawnTime = Date.now();
        this.lifespan = 50000; // 50 seconds lifespan

        // Network sync properties
        this.lastNetworkUpdate = Date.now();
        this.networkUpdateInterval = 50; // Update every 50ms
        this.lastSyncedAge = 0;

        // Create holographic ball
        this.createHolographicBall();

        // Set up collision box
        this.boundingBox = new THREE.Box3();
        this.updateBoundingBox();
    }

    createHolographicBall() {
        // Create geometry (0.5 / 5 = 0.1 radius)
        const geometry = new THREE.SphereGeometry(0.1, 32, 32);

        // Create shader material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0x00ffff) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;
                varying vec3 vNormal;

                void main() {
                    // Create grid pattern
                    vec2 grid = abs(fract(vUv * 10.0 - 0.5) - 0.5) / fwidth(vUv * 10.0);
                    float line = min(grid.x, grid.y);
                    float gridPattern = 1.0 - min(line, 1.0);
                    
                    // Fresnel effect
                    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
                    
                    // Pulsing effect
                    float pulse = 0.5 + 0.5 * sin(time * 2.0);
                    
                    // Combine effects
                    vec3 finalColor = color * (0.5 + 0.5 * fresnel);
                    float alpha = (0.3 + 0.2 * pulse) + gridPattern * 0.5 + fresnel * 0.5;
                    
                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.ball = new THREE.Mesh(geometry, material);
        this.add(this.ball);
    }

    updateBoundingBox() {
        // Update bounding box to match the ball's actual size
        if (this.ball) {
            this.boundingBox.setFromObject(this.ball);
        } else {
            // Fallback if ball mesh isn't ready
            this.boundingBox.setFromCenterAndSize(
                this.position,
                new THREE.Vector3(0.2, 0.2, 0.2)  // Slightly larger than ball for better hit detection
            );
        }
    }

    update(delta) {
        // Update shader time uniform
        if (this.ball && this.ball.material.uniforms) {
            this.ball.material.uniforms.time.value += delta;
        }

        // Update bounding box
        this.updateBoundingBox();

        // Check if lifespan is over
        const age = Date.now() - this.spawnTime;
        return age > this.lifespan;
    }

    takeDamage(damage, hitPosition) {
        this.health -= damage;
        
        // Let the BirdManager handle particle effects
        if (this.birdManager && this.birdManager.engine.particleSystem) {
            this.birdManager.engine.particleSystem.emit(20, {
                position: hitPosition || this.position,
                color: new THREE.Color(0x00ffff),
                size: 0.05,
                lifetime: 1.0,
                speed: 1.0
            });
        }
        
        return this.health <= 0;
    }

    hit(damage, hitPosition) {
        return this.takeDamage(damage, hitPosition);
    }

    getNetworkState() {
        return {
            position: this.position.toArray(),
            health: this.health,
            spawnTime: this.spawnTime
        };
    }

    applyNetworkState(state) {
        this.position.fromArray(state.position);
        this.health = state.health;
        this.spawnTime = state.spawnTime;
    }
}
