import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
        
        // Create body group for VR body - make it a child of the mesh instead of the head
        // This allows the body to be positioned and rotated independently from the head
        this.bodyGroup = new THREE.Group();
        this.mesh.add(this.bodyGroup); // Attach to mesh instead of headGroup
        
        // Track head direction for body rotation
        this.targetBodyRotation = 0;
        this.bodyRotationSpeed = 3.0; // Speed to rotate body towards head direction
        this.bodyTurnThreshold = 0.5; // Radians - when head turns beyond this angle, body starts to turn
        
        // Load VR body model
        this.loadVRBodyModel();
        
        if (!this.isLocal) {
            // Load the VR head model
            const loader = new GLTFLoader();
            const modelPath = '/assets/models/vr head1.glb';
            
            console.log('[PLAYER] Loading VR head model from path:', modelPath);
            
            loader.load(modelPath, (gltf) => {
                console.log('[PLAYER] VR head model loaded successfully');
                this.headModel = gltf.scene;
            
                // Scale and position adjustments if needed
                this.headModel.scale.set(0.15, 0.15, 0.15);
                
                // Rotate the head back to original orientation
                this.headModel.rotation.y = Math.PI;
            
            // Add the head to the headGroup
                this.headGroup.add(this.headModel);
            
            // Only show head for network players
            if (this.isLocal) {
                    this.headModel.visible = false;
            }
            }, 
            // onProgress callback
            (xhr) => {
                console.log(`[PLAYER] VR head model ${(xhr.loaded / xhr.total * 100)}% loaded`);
            },
            // onError callback
            (error) => {
                console.error('[PLAYER] Error loading VR head model:', error);
                // Fall back to the simple geometric head
                this.createSimpleHead();
            });
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

    loadVRBodyModel() {
        // Load the VR body model
        const loader = new GLTFLoader();
        const modelPath = '/assets/models/vr body1.glb';
        
        console.log('[PLAYER] Loading VR body model from path:', modelPath);
        
        loader.load(modelPath, (gltf) => {
            console.log('[PLAYER] VR body model loaded successfully');
            this.bodyModel = gltf.scene;
            
            // Scale and position adjustments for the body
            this.bodyModel.scale.set(0.4, 0.4, 0.4);
            
            // Position the body at floor level
            // Since body is now a child of mesh (not head), position Y needs to account for head height
            this.bodyModel.position.set(0, 1.05, 0); // Lowered from 1.3 to 1.05 (by 0.25 units)
            
            // Rotate the body to face forward
            this.bodyModel.rotation.y = Math.PI;
            
            // Enhance materials/textures
            this.bodyModel.traverse((child) => {
                if (child.isMesh) {
                    // Improve existing materials
                    if (child.material) {
                        // Make materials more visible with better lighting response
                        child.material.needsUpdate = true;
                        
                        // Ensure materials receive light properly
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                        // Improve material rendering
                        if (child.material.map) {
                            // If texture exists, enhance it
                            child.material.map.anisotropy = 16;
                            child.material.map.needsUpdate = true;
                        }
                        
                        // Adjust material properties for better appearance
                        child.material.roughness = 0.3;  // Less rough for more shine
                        child.material.metalness = 0.2;  // Slight metallic look
                        child.material.envMapIntensity = 1.5;  // More environment reflection
                        
                        // Enhance colors if material is too dark
                        if (child.material.color) {
                            // Brighten the color slightly
                            const color = child.material.color.clone();
                            color.r = Math.min(1, color.r * 1.2);
                            color.g = Math.min(1, color.g * 1.2);
                            color.b = Math.min(1, color.b * 1.2);
                            child.material.color = color;
                        }
                    }
                }
            });
            
            // Add the body to the bodyGroup
            this.bodyGroup.add(this.bodyModel);
            
            // Hide body for local player in VR mode (first-person view)
            if (this.isLocal && this.engine.renderer.xr.isPresenting) {
                this.bodyModel.visible = false;
            }
        }, 
        // onProgress callback
        (xhr) => {
            console.log(`[PLAYER] VR body model ${(xhr.loaded / xhr.total * 100)}% loaded`);
        },
        // onError callback
        (error) => {
            console.error('[PLAYER] Error loading VR body model:', error);
            // Create a simple fallback body if model loading fails
            this.createSimpleBody();
        });
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
                
                // Update body position to be directly below the head
                this.bodyGroup.position.x = cameraWorldPos.x;
                this.bodyGroup.position.z = cameraWorldPos.z;
                
                // Get head Y rotation (yaw) to determine body rotation
                this.updateBodyRotation(delta);
                
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

                // Update body position to match player position
                this.bodyGroup.position.x = this.mesh.position.x;
                this.bodyGroup.position.z = this.mesh.position.z;
                
                // In desktop mode, rotate body to match head rotation immediately
                if (this.engine.camera) {
                    // Extract the Y rotation from the camera's quaternion for body rotation
                    const euler = new THREE.Euler().setFromQuaternion(this.engine.camera.quaternion, 'YXZ');
                    this.bodyGroup.rotation.y = euler.y;
                }
            }
        } else {
            // For network players, update body position to match head position
            // but keep rotation separate
            this.bodyGroup.position.x = this.headGroup.position.x;
            this.bodyGroup.position.z = this.headGroup.position.z;
            
            // Get the Y rotation from the head quaternion
            const euler = new THREE.Euler().setFromQuaternion(this.headGroup.quaternion, 'YXZ');
            this.targetBodyRotation = euler.y;
            
            // Smoothly rotate body towards head direction
            this.updateBodyRotation(0.016); // Use fixed delta for network players
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
            
            // Update body position X and Z to match head
            this.bodyGroup.position.x = this.headGroup.position.x;
            this.bodyGroup.position.z = this.headGroup.position.z;
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
            
            // Extract Y rotation for body target rotation
            const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
            this.targetBodyRotation = euler.y;
        }
        
        if (data.bodyRotation !== undefined) {
            // If body rotation is explicitly provided, use it
            this.bodyGroup.rotation.y = data.bodyRotation;
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
            bodyRotation: this.bodyGroup.rotation.y,
            controllers: this.controllers.map(controller => ({
                position: controller.position.toArray(),
                rotation: controller.quaternion.toArray()
            }))
        };

        return update;
    }

    cleanup() {
        // Remove all meshes from the scene
        this.engine.scene.remove(this.mesh);
        
        // Dispose of geometries and materials
        if (this.headModel) {
            this.headModel.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => material.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        }
        
        if (this.bodyModel) {
            this.bodyModel.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => material.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
        }
        
        // Clear references for garbage collection
        this.mesh = null;
        this.headGroup = null;
        this.bodyGroup = null;
        this.headModel = null;
        this.bodyModel = null;
        this.controllers = null;
    }

    onControllerSelect(controller) {
        console.log('Controller select:', controller.index);
    }

    onControllerDeselect(controller) {
        console.log('Controller deselect:', controller.index);
    }

    onMouseInteraction(interaction, isDown) {
        console.log('Mouse interaction:', isDown ? 'down' : 'up', interaction);
    }

    // Fallback method to create a simple geometric head if model loading fails
    createSimpleHead() {
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
        
        // Rotate the head back to original orientation
        head.rotation.y = Math.PI;
        
        // Add the head to the headGroup
        this.headGroup.add(head);
    }

    // Create a simple geometric body if model loading fails
    createSimpleBody() {
        console.log('[PLAYER] Creating simple body fallback');
        const body = new THREE.Group();
        
        // Create shared materials with better appearance
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x3355cc,
            roughness: 0.3,
            metalness: 0.2,
            envMapIntensity: 1.5
        });
        
        const legsMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x223377,
            roughness: 0.3,
            metalness: 0.2,
            envMapIntensity: 1.5
        });
        
        // Create torso - reduced to 2x original size (previously 4x)
        const torso = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.4, 1.2, 12),
            bodyMaterial
        );
        torso.position.y = -0.6;
        torso.castShadow = true;
        torso.receiveShadow = true;
        body.add(torso);
        
        // Create shoulders - reduced to 2x original size
        const shoulders = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.4, 0.2, 12),
            bodyMaterial
        );
        shoulders.position.y = 0;
        shoulders.rotation.z = Math.PI / 2;
        shoulders.castShadow = true;
        shoulders.receiveShadow = true;
        body.add(shoulders);
        
        // Create arms - reduced to 2x original size
        
        // Left arm
        const leftArm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.12, 1.0, 12),
            bodyMaterial
        );
        leftArm.position.set(0.7, -0.2, 0);
        leftArm.rotation.z = Math.PI / 18;
        leftArm.castShadow = true;
        leftArm.receiveShadow = true;
        body.add(leftArm);
        
        // Right arm
        const rightArm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.12, 1.0, 12),
            bodyMaterial
        );
        rightArm.position.set(-0.7, -0.2, 0);
        rightArm.rotation.z = -Math.PI / 18;
        rightArm.castShadow = true;
        rightArm.receiveShadow = true;
        body.add(rightArm);
        
        // Create hips - reduced to 2x original size
        const hips = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.4, 0.2, 12),
            legsMaterial
        );
        hips.position.y = -1.2;
        hips.castShadow = true;
        hips.receiveShadow = true;
        body.add(hips);
        
        // Create legs - reduced to 2x original size
        
        // Left leg
        const leftLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.16, 1.4, 12),
            legsMaterial
        );
        leftLeg.position.set(0.2, -2.0, 0);
        leftLeg.castShadow = true;
        leftLeg.receiveShadow = true;
        body.add(leftLeg);
        
        // Right leg
        const rightLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.16, 1.4, 12),
            legsMaterial
        );
        rightLeg.position.set(-0.2, -2.0, 0);
        rightLeg.castShadow = true;
        rightLeg.receiveShadow = true;
        body.add(rightLeg);
        
        // Position at floor level - adjusted for being child of mesh instead of head
        body.position.y = 1.05; // Lowered from 1.3 to 1.05 (by 0.25 units)
        
        // Add the body to the bodyGroup
        this.bodyGroup.add(body);
        this.bodyModel = body;
        
        // Hide body for local player in VR mode (first-person view)
        if (this.isLocal && this.engine.renderer.xr.isPresenting) {
            this.bodyModel.visible = false;
        }
    }

    // New method to handle body rotation based on head direction
    updateBodyRotation(delta) {
        if (!this.bodyGroup) return;
        
        // Get the current head Y rotation (yaw) from the quaternion
        const headEuler = new THREE.Euler().setFromQuaternion(this.headGroup.quaternion, 'YXZ');
        const headYaw = headEuler.y;
        
        // Calculate the difference between head and body rotation
        let rotDiff = headYaw - this.bodyGroup.rotation.y;
        
        // Normalize the difference to be between -PI and PI
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        
        // Only start turning the body if the head has turned beyond the threshold
        if (Math.abs(rotDiff) > this.bodyTurnThreshold) {
            // Set the target rotation to follow the head
            this.targetBodyRotation = headYaw;
            
            // Smoothly rotate the body towards the target rotation
            const rotAmount = Math.sign(rotDiff) * this.bodyRotationSpeed * delta;
            
            // Limit rotation amount to not overshoot
            if (Math.abs(rotAmount) > Math.abs(rotDiff)) {
                this.bodyGroup.rotation.y = this.targetBodyRotation;
            } else {
                this.bodyGroup.rotation.y += rotAmount;
            }
        }
    }
}
