import * as THREE from 'three';

export class Bird extends THREE.Object3D {
    constructor(position = new THREE.Vector3(), direction = new THREE.Vector3(1, 0, 0)) {
        super();
        
        // Create a smaller green sphere (70% smaller)
        const geometry = new THREE.SphereGeometry(0.075, 32, 32);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00,
            metalness: 0.5,
            roughness: 0.5,
            emissive: 0x002200
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.add(this.mesh);
        
        // Set initial position
        this.position.copy(position);
        this.spawnTime = Date.now();
        this.lifespan = 50000; // 50 seconds lifespan

        // Set up collision box
        this.boundingBox = new THREE.Box3();
        this.updateBoundingBox();
    }

    update(delta) {
        const currentTime = Date.now();

        // Check lifespan
        if (currentTime - this.spawnTime > this.lifespan) {
            return true; // Bird should be removed
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
