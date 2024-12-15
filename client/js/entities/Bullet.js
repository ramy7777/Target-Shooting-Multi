import * as THREE from 'three';

export class Bullet extends THREE.Object3D {
    constructor(position, direction, speed = 0.3, lifespan = 2000) {
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
        this.speed = speed;
        this.creationTime = Date.now();
        this.lifespan = lifespan;

        // Set bullet orientation to match direction
        const quaternion = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.direction);
        this.setRotationFromQuaternion(quaternion);

        console.log('Bullet created:', {
            position: this.position.toArray(),
            direction: this.direction.toArray(),
            speed: this.speed
        });
    }

    update() {
        // Store previous position before moving
        this.previousPosition.copy(this.position);
        
        // Move bullet along its direction
        const movement = this.direction.clone().multiplyScalar(this.speed);
        this.position.add(movement);
        
        // Check if bullet should be destroyed
        const age = Date.now() - this.creationTime;
        if (age > this.lifespan) {
            console.log('Bullet destroyed after', age, 'ms');
            return true; // Should be removed
        }
        return false;
    }
}
