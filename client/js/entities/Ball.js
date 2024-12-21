import * as THREE from 'three';

export class Ball {
    constructor(engine) {
        this.engine = engine;
        this.speed = 2; // Constant speed
        this.direction = new THREE.Vector3(1, 0, 0);
        this.velocity = new THREE.Vector3();
        
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
        this.engine.scene.add(this.mesh);
        
        // Initialize position at platform center
        this.reset();
    }

    reset() {
        // Reset ball to center of platform
        this.mesh.position.set(0, 0.675, 0);
        
        // Random initial direction
        const angle = (Math.random() * Math.PI / 2) - Math.PI / 4; // -45 to 45 degrees
        this.direction.set(Math.cos(angle), 0, Math.sin(angle));
        this.direction.normalize();
        
        // Reset speed
        this.speed = 2;
    }

    update(deltaTime) {
        if (!deltaTime) return; // Skip if no deltaTime provided
        
        console.log('[BALL] Current position:', this.mesh.position.toArray());
        console.log('[BALL] Current direction:', this.direction.toArray());
        console.log('[BALL] Current speed:', this.speed);
        
        // Update velocity based on direction and constant speed
        this.velocity.copy(this.direction).multiplyScalar(this.speed * deltaTime);
        
        // Update position
        this.mesh.position.add(this.velocity);
        
        // Get platform dimensions
        const platformWidth = 1.32;  // Width after 20% reduction
        
        // Only check for collisions with top/bottom edges
        if (Math.abs(this.mesh.position.z) > platformWidth / 2) {
            console.log('[BALL] Z collision');
            // Reverse z direction
            this.direction.z *= -1;
            // Move ball back inside bounds
            this.mesh.position.z = Math.sign(this.mesh.position.z) * platformWidth / 2;
        }
        
        // Check if ball is out of bounds (past paddles)
        const platformLength = 2.145;
        if (Math.abs(this.mesh.position.x) > platformLength / 2 + 0.1) {
            console.log('[BALL] X collision');
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
