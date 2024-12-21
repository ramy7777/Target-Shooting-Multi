import * as THREE from 'three';
import { RifleModel } from '../models/RifleModel.js';

export class Player {
    constructor(engine, id, isLocal) {
        this.engine = engine;
        this.id = id;
        this.isLocal = isLocal;
        
        this.position = new THREE.Vector3();
        this.rotation = new THREE.Euler();
        this.velocity = new THREE.Vector3();
        
        this.setupMesh();
        if (isLocal) {
            this.setupLocalPlayer();
        }
    }

    setupMesh() {
        // Create base group for player
        this.mesh = new THREE.Group();

        // Create head group for VR camera
        this.headGroup = new THREE.Group();
        
        if (!this.isLocal) {
            // Create face model for VR player
            const head = new THREE.Group();
            
            // Create head base
            const headBase = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 16, 16),
                new THREE.MeshStandardMaterial({ color: 0xffcc99 })
            );
            head.add(headBase);
            
            // Add eyes
            const eyeGeometry = new THREE.SphereGeometry(0.025, 8, 8);
            const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
            
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(0.05, 0.02, 0.12);
            head.add(leftEye);
            
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(-0.05, 0.02, 0.12);
            head.add(rightEye);
            
            // Add eyebrows
            const eyebrowGeometry = new THREE.BoxGeometry(0.05, 0.01, 0.01);
            const eyebrowMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2314 });
            
            const leftEyebrow = new THREE.Mesh(eyebrowGeometry, eyebrowMaterial);
            leftEyebrow.position.set(0.05, 0.07, 0.12);
            leftEyebrow.rotation.z = -0.2;
            head.add(leftEyebrow);
            
            const rightEyebrow = new THREE.Mesh(eyebrowGeometry, eyebrowMaterial);
            rightEyebrow.position.set(-0.05, 0.07, 0.12);
            rightEyebrow.rotation.z = 0.2;
            head.add(rightEyebrow);
            
            // Add nose
            const nose = new THREE.Mesh(
                new THREE.ConeGeometry(0.02, 0.04, 4),
                new THREE.MeshStandardMaterial({ color: 0xffbf80 })
            );
            nose.rotation.x = -Math.PI / 2;
            nose.position.set(0, 0, 0.15);
            head.add(nose);
            
            // Add mouth
            const mouth = new THREE.Mesh(
                new THREE.TorusGeometry(0.03, 0.008, 8, 16, Math.PI),
                new THREE.MeshStandardMaterial({ color: 0x8b4513 })
            );
            mouth.rotation.x = Math.PI / 2;
            mouth.rotation.z = Math.PI;
            mouth.position.set(0, -0.05, 0.12);
            head.add(mouth);
            
            // Add ears
            const earGeometry = new THREE.CapsuleGeometry(0.015, 0.03, 4, 8);
            const earMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc99 });
            
            const leftEar = new THREE.Mesh(earGeometry, earMaterial);
            leftEar.position.set(0.15, 0, 0);
            leftEar.rotation.z = Math.PI / 2;
            head.add(leftEar);
            
            const rightEar = new THREE.Mesh(earGeometry, earMaterial);
            rightEar.position.set(-0.15, 0, 0);
            rightEar.rotation.z = Math.PI / 2;
            head.add(rightEar);
            
            // Rotate the entire head 180 degrees around Y axis
            head.rotation.y = Math.PI;
            
            // Add the head to the headGroup
            this.headGroup.add(head);
            
            // Only show head for network players
            if (this.isLocal) {
                head.visible = false;
            }
        }
        this.mesh.add(this.headGroup);
        
        // Create controllers
        this.controllers = [];
        
        // Left controller (empty group for tracking)
        const leftController = new THREE.Group();
        this.controllers.push(leftController);
        this.mesh.add(leftController);

        // Right controller (rifle)
        const rightController = new RifleModel();
        this.controllers.push(rightController);
        this.mesh.add(rightController);

        this.engine.scene.add(this.mesh);
    }

    setupLocalPlayer() {
        // Position the player at spawn point
        this.mesh.position.set(0, 0, 0);
        
        // Setup camera follow for desktop mode
        if (!this.engine.renderer.xr.isPresenting) {
            this.engine.camera.position.set(0, 3, 5);
            this.engine.controls.target = this.mesh.position;
            this.engine.controls.autoRotate = false;
            this.engine.controls.enableDamping = true;
            this.engine.controls.dampingFactor = 0.05;
        }
    }

    update(delta) {
        if (this.isLocal) {
            if (this.engine.renderer.xr.isPresenting) {
                // In VR mode
                const camera = this.engine.renderer.xr.getCamera();
                
                // Update player position based on camera rig
                this.mesh.position.copy(this.engine.cameraRig.position);
                
                // Update head position and rotation from camera
                const cameraWorldPos = new THREE.Vector3();
                const cameraWorldQuat = new THREE.Quaternion();
                camera.getWorldPosition(cameraWorldPos);
                camera.getWorldQuaternion(cameraWorldQuat);
                
                // Set head position and rotation, including the camera rig's rotation for snap turns
                this.headGroup.position.copy(cameraWorldPos);
                
                // Combine camera rig rotation with camera rotation for proper snap rotation
                const rigRotation = new THREE.Quaternion();
                this.engine.cameraRig.getWorldQuaternion(rigRotation);
                this.headGroup.quaternion.multiplyQuaternions(rigRotation, cameraWorldQuat);
                
                // Update controllers if needed
                this.updateControllers();
            } else {
                // Desktop mode
                // Update velocity based on input
                if (this.moveForward) this.velocity.z = -5;
                else if (this.moveBackward) this.velocity.z = 5;
                else this.velocity.z = 0;

                if (this.moveLeft) this.velocity.x = -5;
                else if (this.moveRight) this.velocity.x = 5;
                else this.velocity.x = 0;

                if (this.moveUp) this.velocity.y = 5;
                else if (this.moveDown) this.velocity.y = -5;
                else this.velocity.y = 0;

                // Update position based on camera direction
                const cameraDirection = new THREE.Vector3();
                this.engine.camera.getWorldDirection(cameraDirection);
                cameraDirection.y = 0;
                cameraDirection.normalize();

                const rightVector = new THREE.Vector3();
                rightVector.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));

                // Move in camera direction
                if (this.velocity.z !== 0) {
                    const forward = cameraDirection.clone().multiplyScalar(-this.velocity.z * delta);
                    this.mesh.position.add(forward);
                }
                if (this.velocity.x !== 0) {
                    const right = rightVector.multiplyScalar(this.velocity.x * delta);
                    this.mesh.position.add(right);
                }
                if (this.velocity.y !== 0) {
                    this.mesh.position.y += this.velocity.y * delta;
                }

                // Update camera position
                this.engine.cameraRig.position.copy(this.mesh.position);
                
                // Update head position from camera for network sync
                if (this.engine.camera) {
                    const cameraWorldPos = new THREE.Vector3();
                    this.engine.camera.getWorldPosition(cameraWorldPos);
                    this.headGroup.position.copy(cameraWorldPos);
                    this.headGroup.rotation.copy(this.engine.camera.rotation);
                }

                // Update orbit controls target
                this.engine.controls.target.copy(this.mesh.position);
            }
        }

        // Apply friction
        this.velocity.multiplyScalar(0.85);
    }

    updateControllers() {
        if (!this.engine.renderer.xr.isPresenting) return;

        this.engine.inputManager.controllers.forEach((xrController, index) => {
            if (this.controllers[index]) {
                // Get world position and rotation of XR controller
                const worldPosition = new THREE.Vector3();
                const worldQuaternion = new THREE.Quaternion();
                xrController.getWorldPosition(worldPosition);
                xrController.getWorldQuaternion(worldQuaternion);

                // Convert world position to local position relative to player mesh
                const localPosition = worldPosition.clone().sub(this.mesh.position);
                
                // Update controller position and rotation
                this.controllers[index].position.copy(localPosition);
                this.controllers[index].quaternion.copy(worldQuaternion);
            }
        });
    }

    updateFromNetwork(data) {
        if (!this.mesh) return;
        
        if (data.position) {
            // Update base position
            const targetPosition = new THREE.Vector3().fromArray(data.position);
            this.mesh.position.copy(targetPosition);
        }
        
        if (data.headPosition) {
            // Update head position directly from camera position
            this.headGroup.position.fromArray(data.headPosition);
        }

        if (data.headRotation) {
            // Convert Euler array to Quaternion for smoother rotation
            const quaternion = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                    data.headRotation[0],
                    data.headRotation[1],
                    data.headRotation[2]
                )
            );
            this.headGroup.quaternion.copy(quaternion);
        }

        if (data.controllers) {
            data.controllers.forEach((controllerData, index) => {
                if (this.controllers[index]) {
                    const targetPos = new THREE.Vector3().fromArray(controllerData.position);
                    const targetRot = new THREE.Quaternion().fromArray(controllerData.rotation);
                    
                    this.controllers[index].position.lerp(targetPos, 0.3);
                    this.controllers[index].quaternion.slerp(targetRot, 0.3);
                }
            });
        }
    }

    getNetworkUpdate() {
        let headRotation;
        if (this.isLocal && this.engine.renderer.xr.isPresenting) {
            // For VR mode, combine camera rig and camera rotations
            const camera = this.engine.renderer.xr.getCamera();
            const cameraQuat = new THREE.Quaternion();
            const rigQuat = new THREE.Quaternion();
            
            camera.getWorldQuaternion(cameraQuat);
            this.engine.cameraRig.getWorldQuaternion(rigQuat);
            
            const combinedQuat = rigQuat.multiply(cameraQuat);
            const euler = new THREE.Euler().setFromQuaternion(combinedQuat);
            headRotation = [euler.x, euler.y, euler.z];
        } else {
            // For non-VR mode or network players
            headRotation = [
                this.headGroup.rotation.x,
                this.headGroup.rotation.y,
                this.headGroup.rotation.z
            ];
        }

        const update = {
            position: this.mesh.position.toArray(),
            headPosition: this.isLocal ? this.engine.camera.position.toArray() : this.headGroup.position.toArray(),
            headRotation: headRotation,
            controllers: this.controllers.map(controller => ({

                position: controller.position.toArray(),
                rotation: controller.quaternion.toArray()
            }))
        };

        return update;
    }

    cleanup() {
        this.engine.scene.remove(this.mesh);
    }

    onControllerSelect(controller) {
        // Handle controller select
    }

    onControllerDeselect(controller) {
        // Handle controller deselect
    }

    onMouseInteraction(interaction, isDown) {
        // Handle mouse interaction
    }
}
