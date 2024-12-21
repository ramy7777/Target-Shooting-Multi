import * as THREE from 'three';

export class Ball {
    constructor(engine, id = 'pongBall') {
        this.engine = engine;
        this.id = id;
        this.speed = 0.5; // Reduced from 2 to 0.5 for slower movement
        this.direction = new THREE.Vector3(1, 0, 0);
        this.velocity = new THREE.Vector3();
        this.lastUpdateTime = Date.now();
        
        // Create ball mesh with reduced size (0.1 / 4 = 0.025)
        const geometry = new THREE.SphereGeometry(0.025, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            emissive: 0x444444,
            shininess: 100,
            specular: 0x444444
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(0, 0.675, 0); // Platform height (0.65) plus ball radius (0.025)
        
        // Initialize position at platform center
        this.reset();
    }

    getState() {
        return {
            id: this.id,
            position: this.mesh.position.toArray(),
            direction: this.direction.toArray(),
            speed: this.speed,
            timestamp: Date.now()
        };
    }

    setState(state) {
        if (!state) return;
        
        // Update position
        this.mesh.position.fromArray(state.position);
        this.direction.fromArray(state.direction);
        this.speed = state.speed;
        this.lastUpdateTime = state.timestamp;
    }

    reset() {
        // Reset ball to center of platform
        this.mesh.position.set(0, 0.675, 0);
        this.direction.set(1, 0, 0);
        this.speed = 0.5;
    }

    update(deltaTime) {
        if (!deltaTime) return; // Skip if no deltaTime provided
        
        // Update velocity based on direction and constant speed
        this.velocity.copy(this.direction).multiplyScalar(this.speed * deltaTime);
        
        // Update position
        this.mesh.position.add(this.velocity);
        
        // Get platform dimensions
        const platformWidth = 1.32;  // Width after 20% reduction
        
        // Only check for collisions with top/bottom edges
        if (Math.abs(this.mesh.position.z) > platformWidth / 2) {
            // Reverse z direction
            this.direction.z *= -1;
            // Move ball back inside bounds
            this.mesh.position.z = Math.sign(this.mesh.position.z) * platformWidth / 2;
        }
        
        // Check if ball is out of bounds (past paddles)
        const platformLength = 2.145;
        if (Math.abs(this.mesh.position.x) > platformLength / 2 + 0.1) {
            // Reset ball if it goes past paddles
            this.reset();
        }
        
        // Maintain constant height
        this.mesh.position.y = 0.675;
    }

    dispose() {
        if (this.mesh) {
            this.engine.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}
