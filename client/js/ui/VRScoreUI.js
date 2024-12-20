import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

export class VRScoreUI {
    constructor(engine) {
        this.engine = engine;
        this.scoreGroup = new THREE.Group();
        this.playerTagsGroup = new THREE.Group();
        this.font = null;
        this.textMeshes = new Map();
        this.playerTagMeshes = new Map();
        this.timerMesh = null;
        this.startButton = null;
        this.loadFont();

        // Start the update loop for player tags position
        this.updatePlayerTagsPosition();

        // Add click handler for mouse input
        document.addEventListener('click', (event) => {
            if (!this.engine.uiManager.gameStarted && this.startButton) {
                console.log('[UI] Click event received');
                const mouse = new THREE.Vector2(
                    (event.clientX / window.innerWidth) * 2 - 1,
                    -(event.clientY / window.innerHeight) * 2 + 1
                );
                
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(mouse, this.engine.camera);
                
                const intersects = raycaster.intersectObject(this.startButton, true);
                console.log('[UI] Click intersections:', intersects.length);
                
                if (intersects.length > 0) {
                    console.log('[UI] Start button clicked directly');
                    this.startButton.material = this.startButton.userData.materials.pressed;
                    this.engine.uiManager.handleGameStart();
                }
            }
        });
    }

    updatePlayerTagsPosition() {
        const updatePosition = () => {
            if (this.engine.playerManager && this.engine.playerManager.localPlayer) {
                const player = this.engine.playerManager.localPlayer;
                const playerPosition = player.position;
                
                // Position the tags group relative to player
                this.playerTagsGroup.position.set(
                    playerPosition.x,         // Aligned with player
                    playerPosition.y + 2.5,   // 2.5 units above eye level (moved down by 1)
                    playerPosition.z - 3      // 3 units back
                );

                // Rotate 90 degrees around Y axis to face sideways
                this.playerTagsGroup.rotation.set(0, 0, 0); // No rotation to face forward
            }
            requestAnimationFrame(updatePosition);
        };
        updatePosition();
    }

    async loadFont() {
        const loader = new FontLoader();
        try {
            console.log('[UI] Loading font...');
            this.font = await new Promise((resolve, reject) => {
                loader.load('https://threejs.org/examples/fonts/optimer_bold.typeface.json', 
                    resolve, 
                    undefined, 
                    reject
                );
            });
            console.log('[UI] Font loaded successfully');
            await this.initializeUI();
            console.log('[UI] UI initialized');
        } catch (error) {
            console.error('[UI] Failed to load font:', error);
        }
    }

    async initializeUI() {
        console.log('[UI] Starting UI initialization');
        
        // Position the score panel on the left wall
        const roomWidth = 40; // Match the room dimensions from World.js
        this.scoreGroup.position.set(-roomWidth/2 + 0.1, 4, 0); // Slightly off the wall
        this.scoreGroup.rotation.y = Math.PI/2; // Rotate to face into the room

        // Player tags panel setup - make it taller and narrower
        const tagsBackgroundGeometry = new THREE.PlaneGeometry(1, 2.5);
        const tagsBackgroundMaterial = new THREE.MeshBasicMaterial({
            color: 0x1a1a1a,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const tagsBackground = new THREE.Mesh(tagsBackgroundGeometry, tagsBackgroundMaterial);
        tagsBackground.position.z = -0.01;
        this.playerTagsGroup.add(tagsBackground);

        // Add main background panel with gradient effect
        const mainPanelGeometry = new THREE.PlaneGeometry(4, 6);
        const gradientTexture = this.createGradientTexture();
        const mainPanelMaterial = new THREE.MeshBasicMaterial({ 
            map: gradientTexture,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide
        });
        const mainPanel = new THREE.Mesh(mainPanelGeometry, mainPanelMaterial);
        mainPanel.position.z = -0.02;
        this.scoreGroup.add(mainPanel);

        // Add border frame
        const borderWidth = 0.1;
        const borderGeometry = new THREE.PlaneGeometry(4.2, 6.2);
        const borderMaterial = new THREE.MeshBasicMaterial({
            color: 0x4099ff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        border.position.z = -0.015;
        this.scoreGroup.add(border);

        // Add inner border
        const innerBorderGeometry = new THREE.PlaneGeometry(4, 6);
        const innerBorder = new THREE.Mesh(innerBorderGeometry, borderMaterial.clone());
        innerBorder.position.z = -0.016;
        this.scoreGroup.add(innerBorder);

        // Create corner decorations
        const cornerSize = 0.3;
        const cornerGeometry = new THREE.PlaneGeometry(cornerSize, cornerSize);
        const cornerMaterial = new THREE.MeshBasicMaterial({
            color: 0x4099ff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        // Add corners
        const cornerPositions = [
            { x: -2.1, y: 3.1 },  // Top left
            { x: 2.1, y: 3.1 },   // Top right
            { x: -2.1, y: -3.1 }, // Bottom left
            { x: 2.1, y: -3.1 }   // Bottom right
        ];

        cornerPositions.forEach((pos, index) => {
            const corner = new THREE.Mesh(cornerGeometry, cornerMaterial);
            corner.position.set(pos.x, pos.y, -0.014);
            corner.rotation.z = (Math.PI / 4) + (Math.PI / 2 * index);
            this.scoreGroup.add(corner);
        });

        // Add glow effect with pulsing animation
        const glowGeometry = new THREE.PlaneGeometry(4.4, 6.4);
        const glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0x4099ff) },
                time: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform float time;
                varying vec2 vUv;
                void main() {
                    float dist = length(vUv - vec2(0.5));
                    float pulse = 0.3 + 0.1 * sin(time * 2.0);
                    float edge = smoothstep(0.5, 0.4, dist);
                    float border = smoothstep(0.48, 0.47, dist) * smoothstep(0.45, 0.46, dist);
                    float alpha = (edge * pulse) + (border * 0.8);
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide
        });
        const glowPanel = new THREE.Mesh(glowGeometry, glowMaterial);
        glowPanel.position.z = -0.03;
        this.scoreGroup.add(glowPanel);

        // Create timer display first
        await this.createTimerDisplay();
        console.log('[UI] Timer display created');

        // Add title with enhanced styling
        if (this.font) {
            const titleGeometry = new TextGeometry('LEADERBOARD', {
                font: this.font,
                size: 0.3,
                height: 0.05,
                curveSegments: 12,
                bevelEnabled: true,
                bevelThickness: 0.02,
                bevelSize: 0.01,
                bevelOffset: 0,
                bevelSegments: 5
            });

            titleGeometry.computeBoundingBox();
            const centerOffset = -(titleGeometry.boundingBox.max.x - titleGeometry.boundingBox.min.x) / 2;

            const titleMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                metalness: 0.8,
                roughness: 0.2,
                emissive: 0x4099ff,
                emissiveIntensity: 0.3
            });

            const titleMesh = new THREE.Mesh(titleGeometry, titleMaterial);
            titleMesh.position.set(centerOffset, 2.5, 0);
            this.scoreGroup.add(titleMesh);

            // Add underline
            const underlineGeometry = new THREE.PlaneGeometry(2, 0.05);
            const underlineMaterial = new THREE.MeshBasicMaterial({
                color: 0x4099ff,
                transparent: true,
                opacity: 0.8
            });
            const underline = new THREE.Mesh(underlineGeometry, underlineMaterial);
            underline.position.set(0, 2.3, 0);
            this.scoreGroup.add(underline);
        }

        // Create start button
        await this.createStartButton();
        console.log('[UI] Start button created');

        // Add to scene
        this.engine.scene.add(this.scoreGroup);
        this.engine.scene.add(this.playerTagsGroup);
        console.log('[UI] Added UI elements to scene');
        
        // Start animation loop for glow effect
        const animate = () => {
            if (glowMaterial) {
                glowMaterial.uniforms.time.value = performance.now() * 0.001;
            }
            requestAnimationFrame(animate);
        };
        animate();
    }

    async createTimerDisplay() {
        console.log('[UI] Creating timer display');
        // Create timer text
        const timerGeometry = new TextGeometry('2:00', {
            font: this.font,
            size: 0.3,
            height: 0.03,
            curveSegments: 4,
            bevelEnabled: false
        });

        const timerMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 20.0,
            metalness: 0,
            roughness: 0,
            transparent: true,
            opacity: 1.0
        });

        const timerMesh = new THREE.Mesh(timerGeometry, timerMaterial);
        timerGeometry.computeBoundingBox();
        const centerOffset = -(timerGeometry.boundingBox.max.x - timerGeometry.boundingBox.min.x) / 2;
        timerMesh.position.set(centerOffset, -2.8, 0.01);
        this.scoreGroup.add(timerMesh);
        this.timerMesh = timerMesh;
        
        console.log('[UI] Timer display initialized');
    }

    createGradientTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(25, 25, 35, 0.95)');
        gradient.addColorStop(1, 'rgba(15, 15, 25, 0.95)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    async createStartButton() {
        console.log('[UI] Creating start button');
        // Create button base geometry with rounded edges
        const geometry = new THREE.BoxGeometry(1.4, 0.7, 0.15);
        geometry.translate(0, 0, 0.075); // Move pivot to back face

        // Create modern materials with emissive glow
        const materials = {
            default: new THREE.MeshStandardMaterial({ 
                color: 0x1a9fff,
                emissive: 0x1a9fff,
                emissiveIntensity: 0.5,
                metalness: 0.7,
                roughness: 0.3,
                transparent: true,
                opacity: 0.95
            }),
            hover: new THREE.MeshStandardMaterial({ 
                color: 0x4db8ff,
                emissive: 0x4db8ff,
                emissiveIntensity: 0.8,
                metalness: 0.7,
                roughness: 0.2,
                transparent: true,
                opacity: 0.95
            }),
            pressed: new THREE.MeshStandardMaterial({ 
                color: 0x0066cc,
                emissive: 0x0066cc,
                emissiveIntensity: 0.3,
                metalness: 0.8,
                roughness: 0.4,
                transparent: true,
                opacity: 0.95
            })
        };

        const button = new THREE.Mesh(geometry, materials.default);
        button.userData.materials = materials;
        button.position.set(0, -2, 0.1);
        console.log('[UI] Button position:', button.position);

        // Add text to the button
        const textGeometry = new TextGeometry('Start Game', {
            font: this.font,
            size: 0.15,
            height: 0.03,
            curveSegments: 4,
            bevelEnabled: false
        });

        const textMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 1.0,
            metalness: 0,
            roughness: 0.2
        });

        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textGeometry.computeBoundingBox();
        const centerOffset = -(textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x) / 2;
        textMesh.position.set(centerOffset, -0.07, 0.15);
        button.add(textMesh);

        // Add glow effect
        const glowGeometry = new THREE.BoxGeometry(1.5, 0.8, 0.16);
        const glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0x1a9fff) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;
                void main() {
                    float glow = sin(time * 2.0) * 0.5 + 0.5;
                    gl_FragColor = vec4(color, glow * 0.3);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide
        });

        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        button.add(glowMesh);

        this.startButton = button;
        this.scoreGroup.add(button);
        console.log('[UI] Start button created and added to scene');

        // Start glow animation
        const animate = () => {
            if (glowMaterial) {
                glowMaterial.uniforms.time.value = performance.now() * 0.001;
            }
            requestAnimationFrame(animate);
        };
        animate();
    }

    updatePlayerScore(playerId, score, rank) {
        if (!this.font) return;

        // Update main leaderboard
        if (this.textMeshes.has(playerId)) {
            const display = this.textMeshes.get(playerId);
            this.scoreGroup.remove(display.text);
            display.text.geometry.dispose();
            display.text.material.dispose();
            this.textMeshes.delete(playerId);
        }

        // Update player tag
        if (this.playerTagMeshes.has(playerId)) {
            const display = this.playerTagMeshes.get(playerId);
            this.playerTagsGroup.remove(display.text);
            display.text.geometry.dispose();
            display.text.material.dispose();
            this.playerTagMeshes.delete(playerId);
        }

        // Calculate vertical positions
        const startY = 1.8;
        const spacing = 0.45;
        const tagYPosition = 0.8 - (rank * 0.2); // More compact spacing for floating panel

        // Create text content
        const isLocalPlayer = playerId === this.engine.playerManager.localPlayer.id;
        const playerText = isLocalPlayer ? 'You' : `Player ${playerId}`;
        const scoreText = `${rank + 1}. ${playerText}: ${score}`;
        const tagText = `${rank + 1}. ${playerText}: ${score}`; // Include score in tag

        // Create main leaderboard text
        const textGeometry = new TextGeometry(scoreText, {
            font: this.font,
            size: 0.225,
            height: 0,
            curveSegments: 4,
            bevelEnabled: false
        });

        const textMaterial = new THREE.MeshStandardMaterial({ 
            color: isLocalPlayer ? 0x00ffff : 0xffffff,
            emissive: isLocalPlayer ? 0x00ffff : 0xffffff,
            emissiveIntensity: 20.0, // Dramatically increased for maximum visibility
            metalness: 0,
            roughness: 0,  // Reduced roughness for more shine
            transparent: true,
            opacity: 1.0
        });

        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        
        // Center and position main text
        textGeometry.computeBoundingBox();
        const centerOffset = -(textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x) / 2;
        textMesh.position.set(centerOffset, startY - (rank * spacing), 0.02);
        this.scoreGroup.add(textMesh);
        this.textMeshes.set(playerId, { text: textMesh });

        // Create player tag text (smaller and includes score)
        const tagGeometry = new TextGeometry(tagText, {
            font: this.font,
            size: 0.1, // Even smaller for floating panel
            height: 0,
            curveSegments: 4,
            bevelEnabled: false
        });

        const tagMaterial = new THREE.MeshStandardMaterial({ 
            color: isLocalPlayer ? 0x00ffff : 0xffffff,
            emissive: isLocalPlayer ? 0x00ffff : 0xffffff,
            emissiveIntensity: 20.0, // Dramatically increased for maximum visibility
            metalness: 0,
            roughness: 0,  // Reduced roughness for more shine
            transparent: true,
            opacity: 1.0
        });

        const tagMesh = new THREE.Mesh(tagGeometry, tagMaterial);
        
        // Center and position tag text
        tagGeometry.computeBoundingBox();
        const tagCenterOffset = -(tagGeometry.boundingBox.max.x - tagGeometry.boundingBox.min.x) / 2;
        tagMesh.position.set(tagCenterOffset, tagYPosition, 0.02);
        this.playerTagsGroup.add(tagMesh);
        this.playerTagMeshes.set(playerId, { text: tagMesh });
    }

    removePlayer(playerId) {
        // Remove from main leaderboard
        if (this.textMeshes.has(playerId)) {
            const display = this.textMeshes.get(playerId);
            this.scoreGroup.remove(display.text);
            display.text.geometry.dispose();
            display.text.material.dispose();
            this.textMeshes.delete(playerId);
        }

        // Remove from player tags
        if (this.playerTagMeshes.has(playerId)) {
            const display = this.playerTagMeshes.get(playerId);
            this.playerTagsGroup.remove(display.text);
            display.text.geometry.dispose();
            display.text.material.dispose();
            this.playerTagMeshes.delete(playerId);
        }
        
        // Reposition remaining scores
        this.repositionScores();
    }

    repositionScores() {
        const startY = 1.8;
        const spacing = 0.45;
        const tagStartY = 0.8;
        const tagSpacing = 0.2;
        
        const players = Array.from(this.textMeshes.keys());
        players.forEach((playerId, index) => {
            // Reposition main leaderboard text
            const display = this.textMeshes.get(playerId);
            const yPosition = startY - (index * spacing);
            display.text.position.y = yPosition;

            // Reposition player tag text
            const tagDisplay = this.playerTagMeshes.get(playerId);
            const tagYPosition = tagStartY - (index * tagSpacing);
            tagDisplay.text.position.y = tagYPosition;
        });
    }

    update() {
        // Check for start button interaction
        if (this.startButton && !this.engine.uiManager.gameStarted) {
            const session = this.engine.renderer.xr.getSession();
            const raycaster = new THREE.Raycaster();
            
            if (session) {
                // VR Mode interaction
                const controllers = this.engine.inputManager.controllers;
                
                for (let i = 0; i < controllers.length; i++) {
                    const controller = controllers[i];
                    const inputSource = session.inputSources[i];
                    if (!inputSource) continue;
                    
                    const gamepad = inputSource.gamepad;
                    if (!gamepad) continue;

                    // Create temporary objects for raycasting
                    const tempMatrix = new THREE.Matrix4();
                    
                    tempMatrix.identity().extractRotation(controller.matrixWorld);
                    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
                    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

                    // Check intersection in world space first
                    const intersects = raycaster.intersectObject(this.startButton, true);

                    if (intersects.length > 0) {
                        this.startButton.material = this.startButton.userData.materials.hover;

                        if (gamepad.buttons[0] && gamepad.buttons[0].pressed) {
                            this.startButton.material = this.startButton.userData.materials.pressed;
                            
                            // Add haptic feedback
                            if (gamepad.hapticActuators && gamepad.hapticActuators[0]) {
                                gamepad.hapticActuators[0].pulse(1.0, 100);
                            }
                            
                            this.engine.uiManager.handleGameStart();
                        }
                    } else {
                        this.startButton.material = this.startButton.userData.materials.default;
                    }
                }
            } else {
                // Non-VR Mode interaction
                const mouse = this.engine.inputManager.mouse;
                const mouseClicked = this.engine.inputManager.mouseClicked;
                
                // Debug mouse state
                console.log('[UI] Mouse state:', {
                    x: mouse.x,
                    y: mouse.y,
                    clicked: mouseClicked,
                    buttons: this.engine.inputManager.mouseButtons
                });
                
                // Convert mouse position to normalized device coordinates
                const mouseNDC = new THREE.Vector2(
                    (mouse.x / window.innerWidth) * 2 - 1,
                    -(mouse.y / window.innerHeight) * 2 + 1
                );
                
                // Debug NDC coordinates
                console.log('[UI] Mouse NDC:', mouseNDC);
                
                // Update the picking ray with the camera and mouse position
                raycaster.setFromCamera(mouseNDC, this.engine.camera);

                // Debug ray direction
                console.log('[UI] Ray direction:', raycaster.ray.direction);

                // Check intersection in world space
                const intersects = raycaster.intersectObject(this.startButton, true);
                console.log('[UI] Intersections:', intersects.length);

                if (intersects.length > 0) {
                    console.log('[UI] Button hovered, distance:', intersects[0].distance);
                    this.startButton.material = this.startButton.userData.materials.hover;
                    
                    if (mouseClicked) {
                        console.log('[UI] Start button clicked with mouse');
                        this.startButton.material = this.startButton.userData.materials.pressed;
                        this.engine.uiManager.handleGameStart();
                    }
                } else {
                    this.startButton.material = this.startButton.userData.materials.default;
                }
            }
        }
    }

    updateTimer(timeText) {
        if (!this.timerMesh) {
            console.warn('[UI] Timer mesh not initialized');
            return;
        }
        
        // Create timer text
        const timerGeometry = new TextGeometry(timeText, {
            font: this.font,
            size: 0.3,
            height: 0.03,
            curveSegments: 4,
            bevelEnabled: false
        });

        const timerMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 20.0,
            metalness: 0,
            roughness: 0,
            transparent: true,
            opacity: 1.0
        });

        // Update timer mesh
        if (this.timerMesh.geometry) {
            this.timerMesh.geometry.dispose();
            this.timerMesh.geometry = timerGeometry;
        } else {
            this.timerMesh.geometry = timerGeometry;
        }
        if (this.timerMesh.material) {
            this.timerMesh.material.dispose();
            this.timerMesh.material = timerMaterial;
        } else {
            this.timerMesh.material = timerMaterial;
        }

        // Position timer
        timerGeometry.computeBoundingBox();
        const centerOffset = -(timerGeometry.boundingBox.max.x - timerGeometry.boundingBox.min.x) / 2;
        this.timerMesh.position.set(centerOffset, -2.8, 0.01);
        
        console.log('[UI] Timer updated to:', timeText);
    }
}
