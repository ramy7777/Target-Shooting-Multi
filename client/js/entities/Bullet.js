import * as THREE from 'three';

export class Bullet extends THREE.Object3D {
    constructor(position, direction, shooterId, speed = 0.3, lifespan = 2000) {
        super();
        
        // Create bullet mesh
        const geometry = new THREE.SphereGeometry(0.5, 16, 16);
        const material = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            shininess: 100
        });
        this.bulletMesh = new THREE.Mesh(geometry, material);
        this.add(this.bulletMesh);
        
        // Set initial position and properties
        this.position.copy(position);
        this.previousPosition = position.clone(); // Store previous position
        this.direction = direction.clone().normalize(); // Clone and normalize direction
        this.velocity = this.direction.clone().multiplyScalar(0.2); // Store velocity for collision detection
        this.speed = speed;
        this.creationTime = Date.now();
        this.lifespan = lifespan;
        this.shooterId = shooterId;

        // Set bullet orientation to match direction
        const quaternion = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.direction);
        this.setRotationFromQuaternion(quaternion);
    }

    update(deltaTime) {
        // Update previous position for collision detection
        this.previousPosition.copy(this.position);
        
        // Move bullet
        const movement = this.direction.clone().multiplyScalar(this.speed);
        this.position.add(movement);
        
        // Update velocity for collision detection
        this.velocity.copy(movement);
        
        // Check if bullet should be destroyed
        const age = Date.now() - this.creationTime;
        if (age > this.lifespan) {
            return true; // Should be removed
        }
        return false;
    }
}
