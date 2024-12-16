import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class RifleModel extends THREE.Group {
    constructor() {
        super();
        this.loadPistolModel();
    }

    async loadPistolModel() {
        const loader = new GLTFLoader();
        try {
            const gltf = await loader.loadAsync('/assets/models/pistol/copper pistol.glb');
            const model = gltf.scene;
            
            // Adjust scale and position for the pistol model
            model.scale.set(0.14, 0.14, 0.14);  // Reduced by another 30% (0.2 * 0.7 = 0.14)
            model.position.set(0, -0.06, -0.1);  // Moved up by 0.09 units (from -0.15 to -0.06)
            model.rotation.x = 0;
            model.rotation.y = Math.PI;  // 180-degree flip to face forward
            
            // Add the model to the group
            this.add(model);
            
        } catch (error) {
            console.error('Error loading pistol model:', error);
            // Fallback to create a basic pistol if model fails to load
            this.createBasicPistol();
        }
    }

    // Fallback method in case the model fails to load
    createBasicPistol() {
        const geometry = new THREE.BoxGeometry(0.05, 0.08, 0.2);  // Shorter length for pistol
        const material = new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.7,
            metalness: 0.5
        });
        const pistol = new THREE.Mesh(geometry, material);
        this.add(pistol);
    }
}
