import * as THREE from 'three';

export class ParticleManager {
    constructor(engine) {
        this.engine = engine;
        this.particleSystems = new Map(); // Store active particle systems
    }

    createExplosion(position, color = 0x00ff44, particleCount = 30) {
        // Create particle geometry
        const particles = new THREE.BufferGeometry();
        const positions = [];
        const velocities = [];
        const lifetimes = [];

        // Create particles with random velocities
        for (let i = 0; i < particleCount; i++) {
            // Random position slightly offset from center
            positions.push(
                position.x + (Math.random() - 0.5) * 0.1,
                position.y + (Math.random() - 0.5) * 0.1,
                position.z + (Math.random() - 0.5) * 0.1
            );

            // Random velocity in all directions
            const speed = 2 + Math.random() * 2;
            const angle = Math.random() * Math.PI * 2;
            const elevation = Math.random() * Math.PI - Math.PI / 2;
            velocities.push(
                Math.cos(angle) * Math.cos(elevation) * speed,
                Math.sin(elevation) * speed,
                Math.sin(angle) * Math.cos(elevation) * speed
            );

            // Random lifetime between 0.5 and 1 second
            lifetimes.push(0.5 + Math.random() * 0.5);
        }

        particles.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particles.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
        particles.setAttribute('lifetime', new THREE.Float32BufferAttribute(lifetimes, 1));

        // Create particle material with custom shader
        const material = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(color) },
                time: { value: 0 }
            },
            vertexShader: `
                attribute vec3 velocity;
                attribute float lifetime;
                varying float vAlpha;
                uniform float time;

                void main() {
                    // Update position based on velocity and time
                    vec3 pos = position + velocity * time;
                    
                    // Calculate alpha based on lifetime
                    vAlpha = 1.0 - (time / lifetime);
                    vAlpha = clamp(vAlpha, 0.0, 1.0);

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                    gl_PointSize = 5.0 * vAlpha;
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                varying float vAlpha;

                void main() {
                    if (vAlpha <= 0.0) discard;
                    
                    // Create a circular particle
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    if (dist > 0.5) discard;

                    // Add glow effect
                    float glow = 1.0 - (dist * 2.0);
                    gl_FragColor = vec4(color, vAlpha * glow);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Create the particle system
        const system = new THREE.Points(particles, material);
        system.startTime = this.engine.clock.getElapsedTime();
        system.maxLifetime = Math.max(...lifetimes);

        // Add to scene and store reference
        this.engine.scene.add(system);
        const systemId = THREE.MathUtils.generateUUID();
        this.particleSystems.set(systemId, system);

        return systemId;
    }

    update() {
        const currentTime = this.engine.clock.getElapsedTime();

        // Update all particle systems
        for (const [id, system] of this.particleSystems) {
            const elapsedTime = currentTime - system.startTime;
            system.material.uniforms.time.value = elapsedTime;

            // Remove system if all particles have expired
            if (elapsedTime >= system.maxLifetime) {
                this.engine.scene.remove(system);
                system.geometry.dispose();
                system.material.dispose();
                this.particleSystems.delete(id);
            }
        }
    }

    handleNetworkExplosion(data) {
        const position = new THREE.Vector3().fromArray(data.position);
        this.createExplosion(position, data.color);
    }
}

export default ParticleManager;
