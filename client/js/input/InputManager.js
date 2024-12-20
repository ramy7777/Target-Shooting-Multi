import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class InputManager {
    constructor(engine) {
        this.engine = engine;
        this.xrSession = null;

        // Mouse state
        this.mouse = new THREE.Vector2();
        this.mouseButtons = {
            left: false,
            middle: false,
            right: false
        };
        this.mouseClicked = false;

        // Controller settings from documentation
        this.deadzone = 0.2;           // Thumbstick deadzone
        this.moveSpeed = 0.1;          // Movement speed
        this.rotateSpeed = 0.05;       // Rotation speed
        this.snapAngle = 45;           // Degrees
        this.rotationCooldown = false;
        this.rotationCooldownTime = 400; // ms

        // Meta Quest 3 Button Mapping
        this.QUEST3_MAPPING = {
            buttons: {
                trigger: 0,    // Index finger trigger
                grip: 1,       // Hand grip
                menu: 2,       // Menu button (left controller only)
                thumbstick: 3, // Thumbstick press
                X_A: 4,        // X button (left) or A button (right)
                Y_B: 5         // Y button (left) or B button (right)
            },
            axes: {
                thumbstick: {
                    X: 2,     // Horizontal axis
                    Y: 3      // Vertical axis
                }
            }
        };

        // Initialize other properties
        this.controllers = [];
        this.controllerGrips = [];
        this.raycaster = new THREE.Raycaster();

        // Initialize controllers
        this.initializeControllers();

        // Setup keyboard controls
        this.keys = {};
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Setup mouse controls
        document.addEventListener('mousemove', (event) => {
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
            console.log('[INPUT] Mouse moved:', { x: this.mouse.x, y: this.mouse.y });
        });
        
        document.addEventListener('mousedown', (event) => {
            console.log('[INPUT] Mouse down:', event.button);
            if (event.button === 0) { // Left click
                this.mouseButtons.left = true;
                this.mouseClicked = true;
                console.log('[INPUT] Left mouse button pressed');
                this.handlePCShoot();
            }
        });
        
        document.addEventListener('mouseup', (event) => {
            console.log('[INPUT] Mouse up:', event.button);
            if (event.button === 0) { // Left click
                this.mouseButtons.left = false;
                this.mouseClicked = false;
                console.log('[INPUT] Left mouse button released');
            }
        });

        this.lastTriggerState = {
            left: false,
            right: false
        };
        this.lastMouseClick = 0;
        this.mouseClickCooldown = 100; // ms
    }

    initializeControllers() {
        const controllerModelFactory = new XRControllerModelFactory();

        // Initialize both controllers
        for (let i = 0; i < 2; i++) {
            const controller = this.engine.renderer.xr.getController(i);
            controller.name = i === 0 ? 'left' : 'right';
            controller.userData = { isSelecting: false, lastTime: 0 };
            this.engine.cameraRig.add(controller);

            const grip = this.engine.renderer.xr.getControllerGrip(i);
            this.engine.cameraRig.add(grip);

            // Add visual line for raycaster
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -1)
            ]);
            const material = new THREE.LineBasicMaterial({ color: 0xffffff });
            const line = new THREE.Line(geometry, material);
            controller.add(line);
            
            // Store references
            this.controllers.push(controller);
            this.controllerGrips.push(grip);

            // Add event listeners
            controller.addEventListener('selectstart', () => this.onControllerSelectStart(controller));
            controller.addEventListener('selectend', () => this.onControllerSelectEnd(controller));
        }
    }

    onKeyDown(e) {
        this.keys[e.code] = true;
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
    }

    updateKeyboardInput(delta) {
        if (this.engine.renderer.xr.isPresenting) return;

        const moveSpeed = this.moveSpeed;
        const movement = new THREE.Vector3();

        // Get camera's forward direction for movement
        const cameraDirection = new THREE.Vector3();
        this.engine.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        // Calculate right vector
        const rightVector = new THREE.Vector3();
        rightVector.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));

        // WASD movement - using clone() to avoid modifying the original vectors
        if (this.keys['KeyW']) movement.add(cameraDirection.clone().multiplyScalar(moveSpeed));
        if (this.keys['KeyS']) movement.add(cameraDirection.clone().multiplyScalar(-moveSpeed));
        if (this.keys['KeyA']) movement.add(rightVector.clone().multiplyScalar(-moveSpeed));
        if (this.keys['KeyD']) movement.add(rightVector.clone().multiplyScalar(moveSpeed));

        // Apply movement with boundaries
        if (movement.length() > 0) {
            const newPosition = this.engine.cameraRig.position.clone().add(movement);
            const BOUNDARY_LIMIT = 19;

            newPosition.x = THREE.MathUtils.clamp(newPosition.x, -BOUNDARY_LIMIT, BOUNDARY_LIMIT);
            newPosition.z = THREE.MathUtils.clamp(newPosition.z, -BOUNDARY_LIMIT, BOUNDARY_LIMIT);
            this.engine.cameraRig.position.copy(newPosition);

            // Update local player position if it exists
            if (this.engine.playerManager?.localPlayer) {
                this.engine.playerManager.localPlayer.mesh.position.copy(this.engine.cameraRig.position);
            }
        }
    }

    update(delta, frame) {
        // Only update controllers in VR mode
        if (!this.engine.renderer.xr.isPresenting) {
            this.updateKeyboardInput(delta);
            return;
        }
        
        // Update VR input when in VR session
        if (frame) {
            this.updateVRInput(frame);
        }
    }

    updateVRInput(frame) {
        if (!frame) return;

        const session = frame.session;
        if (!session) return;

        const referenceSpace = this.engine.renderer.xr.getReferenceSpace();
        if (!referenceSpace) return;

        // Get the pose
        const pose = frame.getViewerPose(referenceSpace);
        if (pose) {
            // Update controllers
            for (const inputSource of session.inputSources) {
                this.processControllerInput(inputSource);
            }
        }
    }

    processControllerInput(inputSource) {
        const gamepad = inputSource.gamepad;
        if (!gamepad) return;

        // Get thumbstick values
        const x = gamepad.axes[this.QUEST3_MAPPING.axes.thumbstick.X];
        const y = gamepad.axes[this.QUEST3_MAPPING.axes.thumbstick.Y];

        // Apply deadzone
        const deadX = Math.abs(x) < this.deadzone ? 0 : x;
        const deadY = Math.abs(y) < this.deadzone ? 0 : y;

        // Process based on controller side
        if (inputSource.handedness === 'left') {
            this.processLeftController(deadX, deadY, gamepad);
        } else if (inputSource.handedness === 'right') {
            this.processRightController(deadX, deadY, gamepad);
        }
    }

    handlePrimaryInteraction(controller) {
        // Primary interaction (left trigger)
        const wasPressed = this.lastTriggerState[controller];
        
        if (!wasPressed) {
            console.log('Primary interaction triggered');
            // Sound is now handled by BulletManager
        }
        
        this.lastTriggerState[controller] = true;
    }

    handlePrimaryInteractionEnd(controller) {
        this.lastTriggerState[controller] = false;
    }

    processLeftController(x, y, gamepad) {
        // Movement
        if (Math.abs(x) > this.deadzone || Math.abs(y) > this.deadzone) {
            // Calculate movement vector
            const movement = new THREE.Vector3();
            const cameraDirection = new THREE.Vector3();
            this.engine.camera.getWorldDirection(cameraDirection);
            cameraDirection.y = 0;
            cameraDirection.normalize();

            const strafeDirection = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x);

            movement.add(strafeDirection.multiplyScalar(x * this.moveSpeed));
            movement.add(cameraDirection.multiplyScalar(-y * this.moveSpeed));

            const newPosition = this.engine.cameraRig.position.clone().add(movement);
            const BOUNDARY_LIMIT = 19;
            newPosition.x = THREE.MathUtils.clamp(newPosition.x, -BOUNDARY_LIMIT, BOUNDARY_LIMIT);
            newPosition.z = THREE.MathUtils.clamp(newPosition.z, -BOUNDARY_LIMIT, BOUNDARY_LIMIT);
            this.engine.cameraRig.position.copy(newPosition);

            // Update local player position
            if (this.engine.playerManager?.localPlayer) {
                this.engine.playerManager.localPlayer.mesh.position.copy(this.engine.cameraRig.position);
            }
            
            // Haptic feedback only for significant movement
            if (Math.abs(x) > 0.8 || Math.abs(y) > 0.8) {
                this.triggerHapticFeedback(gamepad, 0.2, 50);
            }
        }

        // Button checks with optimized haptic feedback
        const buttons = gamepad.buttons;
        
        // Trigger (index finger)
        if (buttons[0]?.pressed) {
            if (!this.lastTriggerState.left) {
                this.handlePrimaryInteraction('left');
                this.triggerHapticFeedback(gamepad, 0.5, 50);
            }
        } else if (this.lastTriggerState.left) {
            this.handlePrimaryInteractionEnd('left');
        }
        
        // Other buttons with haptic feedback
        if (buttons[1]?.pressed) this.triggerHapticFeedback(gamepad, 0.3, 50);
        if (buttons[2]?.pressed) {
            this.triggerHapticFeedback(gamepad, 0.7, 100);
            this.handleMenuPress();
        }
        if (buttons[3]?.pressed) this.triggerHapticFeedback(gamepad, 0.4, 50);
        if (buttons[4]?.pressed) this.triggerHapticFeedback(gamepad, 0.3, 50);
        if (buttons[5]?.pressed) this.triggerHapticFeedback(gamepad, 0.3, 50);
    }

    processRightController(x, y, gamepad) {
        // Handle rotation
        if (Math.abs(x) > this.deadzone && !this.rotationCooldown) {
            const rotationDirection = x > 0 ? 1 : -1;
            const rotationAngle = (this.snapAngle * Math.PI) / 180;
            
            // Rotate camera rig
            this.engine.cameraRig.rotation.y -= rotationAngle * rotationDirection;

            // Haptic feedback
            this.triggerHapticFeedback(gamepad, 0.5, 100);

            // Set cooldown
            this.rotationCooldown = true;
            setTimeout(() => {
                this.rotationCooldown = false;
            }, this.rotationCooldownTime);
        }

        // Button checks with optimized haptic feedback
        const buttons = gamepad.buttons;
        
        // Trigger
        if (buttons[0]?.pressed) {
            if (!this.lastTriggerState.right) {
                this.handlePrimaryInteraction('right');
                this.triggerHapticFeedback(gamepad, 0.5, 50);
            }
        } else if (this.lastTriggerState.right) {
            this.handlePrimaryInteractionEnd('right');
        }
        
        // Other buttons with haptic feedback
        if (buttons[1]?.pressed) this.triggerHapticFeedback(gamepad, 0.3, 50);
        if (buttons[3]?.pressed) this.triggerHapticFeedback(gamepad, 0.4, 50);
        if (buttons[4]?.pressed) this.triggerHapticFeedback(gamepad, 0.3, 50);
        if (buttons[5]?.pressed) this.triggerHapticFeedback(gamepad, 0.3, 50);
    }

    onControllerSelectStart(controller) {
        controller.userData.isSelecting = true;
        this.updateDebugInfo(`Controller ${controller.name} select start`);
    }

    onControllerSelectEnd(controller) {
        controller.userData.isSelecting = false;
        this.updateDebugInfo(`Controller ${controller.name} select end`);
    }

    updateDebugInfo(text) {
        const debugDiv = document.getElementById('debug');
        if (debugDiv) {
            debugDiv.innerHTML = text;
        }
    }

    handlePCShoot() {
        const now = Date.now();
        if (now - this.lastMouseClick < this.mouseClickCooldown) {
            return; // Still in cooldown
        }
        this.lastMouseClick = now;

        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const mouse = new THREE.Vector2();
        mouse.x = (this.mouse.x / window.innerWidth) * 2 - 1;
        mouse.y = -(this.mouse.y / window.innerHeight) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(mouse, this.engine.camera);

        // Get the direction from the raycaster
        const direction = this.raycaster.ray.direction;
        
        // Get camera position
        const position = new THREE.Vector3();
        this.engine.camera.getWorldPosition(position);

        // Offset bullet spawn position slightly forward to avoid self-collision
        const spawnOffset = direction.clone().multiplyScalar(0.5);
        position.add(spawnOffset);
        
        // Create bullet through BulletManager
        if (this.engine.bulletManager) {
            this.engine.bulletManager.createBullet(position, direction);
        }
    }

    handleMenuPress() {
        console.log('Menu button pressed');
        // Toggle menu visibility or perform menu action
        if (this.engine.ui) {
            this.engine.ui.toggleMenu();
        }
        this.updateDebugInfo('Menu button pressed');
    }

    triggerHapticFeedback(gamepad, intensity = 1.0, duration = 100) {
        if (gamepad.hapticActuators?.[0]) {
            gamepad.hapticActuators[0].pulse(intensity, duration)
                .catch(() => {}); // Silently handle haptic feedback errors
        }
    }
}
