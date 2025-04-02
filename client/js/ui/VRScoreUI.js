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
        this.sidePanelTimerMesh = null;
        this.startButton = null;
        this.loadFont();

        // Start the update loop for player tags position
        this.updatePlayerTagsPosition();
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

        // Add side panel timer
        await this.createSidePanelTimerDisplay();
        console.log('[UI] Side panel timer display created');

        // Add 'PLAYERS' heading to side panel
        if (this.font) {
            const headingGeometry = new TextGeometry('PLAYERS', {
                font: this.font,
                size: 0.1,
                height: 0.01,
                curveSegments: 4,
                bevelEnabled: false
            });

            const headingMaterial = new THREE.MeshStandardMaterial({
                color: 0x4099ff,
                emissive: 0x4099ff,
                emissiveIntensity: 10.0,
                metalness: 0,
                roughness: 0,
                transparent: true,
                opacity: 1.0
            });

            const headingMesh = new THREE.Mesh(headingGeometry, headingMaterial);
            headingGeometry.computeBoundingBox();
            const headingCenterOffset = -(headingGeometry.boundingBox.max.x - headingGeometry.boundingBox.min.x) / 2;
            headingMesh.position.set(headingCenterOffset, 1.1, 0.01);
            this.playerTagsGroup.add(headingMesh);
        }

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
        border.position.z = -0.03;
        this.scoreGroup.add(border);

        // Create timer display
        await this.createTimerDisplay();
        console.log('[UI] Timer display created');

        // Create title text
        if (this.font) {
            const titleGeometry = new TextGeometry('SCORES', {
                font: this.font,
                size: 0.4,
                height: 0,
                curveSegments: 12,
                bevelEnabled: false
            });

            const titleMaterial = new THREE.MeshStandardMaterial({
                color: 0x4099ff,
                emissive: 0x4099ff,
                emissiveIntensity: 0.5,
                metalness: 0,
                roughness: 0.2
            });

            titleGeometry.computeBoundingBox();
            const centerOffset = -(titleGeometry.boundingBox.max.x - titleGeometry.boundingBox.min.x) / 2;

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

        // Add to scene first so UI is visible while waiting for network
        this.engine.scene.add(this.scoreGroup);
        this.engine.scene.add(this.playerTagsGroup);
        console.log('[UI] Added UI elements to scene');

        // Wait for NetworkManager to be initialized and host status to be confirmed
        await new Promise(resolve => {
            const checkHostStatus = () => {
                if (this.engine.networkManager && this.engine.networkManager.connected) {
                    // If we're connected and have host status (true or false), we can proceed
                    if (typeof this.engine.networkManager.isHost === 'boolean' && this.engine.networkManager.currentRoom) {
                        console.log('[UI] Host status confirmed:', this.engine.networkManager.isHost);
                        resolve();
                    } else {
                        setTimeout(checkHostStatus, 100);
                    }
                } else {
                    setTimeout(checkHostStatus, 100);
                }
            };
            checkHostStatus();
        });

        // Create start button only for host
        if (this.engine.networkManager.isHost) {
            await this.createStartButton();
            console.log('[UI] Start button created for host');
        } else {
            console.log('[UI] Client - skipping start button creation');
        }
        
        // Start animation loop for glow effect
        const animate = () => {
            if (this.glowMaterial) {
                this.glowMaterial.uniforms.time.value = performance.now() * 0.001;
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

        // Create new timer mesh if it doesn't exist
        if (!this.timerMesh) {
            this.timerMesh = new THREE.Mesh(timerGeometry, timerMaterial);
            timerGeometry.computeBoundingBox();
            const centerOffset = -(timerGeometry.boundingBox.max.x - timerGeometry.boundingBox.min.x) / 2;
            this.timerMesh.position.set(centerOffset, -2.8, 0.01);
            this.scoreGroup.add(this.timerMesh);
        } else {
            // Update existing timer mesh
            if (this.timerMesh.geometry) {
                this.timerMesh.geometry.dispose();
            }
            if (this.timerMesh.material) {
                this.timerMesh.material.dispose();
            }
            this.timerMesh.geometry = timerGeometry;
            this.timerMesh.material = timerMaterial;
            timerGeometry.computeBoundingBox();
            const centerOffset = -(timerGeometry.boundingBox.max.x - timerGeometry.boundingBox.min.x) / 2;
            this.timerMesh.position.set(centerOffset, -2.8, 0.01);
        }
        
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
                metalness: 0.7,
                roughness: 0.4,
                transparent: true,
                opacity: 0.95
            })
        };

        // Create button mesh
        this.startButton = new THREE.Mesh(geometry, materials.default);
        this.startButton.position.set(0, -2, 0.1);
        this.startButton.userData = {
            type: 'button',
            materials: materials,
            isStartButton: true
        };

        // Add glow effect
        const glowGeometry = new THREE.PlaneGeometry(1.6, 0.9);
        this.glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0x1a9fff) },
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
                    float pulse = 0.4 + 0.2 * sin(time * 3.0);
                    float alpha = smoothstep(0.5, 0.2, dist) * pulse;
                    gl_FragColor = vec4(color, alpha * 0.5);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const glowMesh = new THREE.Mesh(glowGeometry, this.glowMaterial);
        glowMesh.position.set(0, 0, -0.05);
        this.startButton.add(glowMesh);

        // Create text with modern font and better contrast
        if (this.font) {
            const textGeometry = new TextGeometry('START', {
                font: this.font,
                size: 0.2,
                height: 0,
                curveSegments: 12,
                bevelEnabled: false
            });

            textGeometry.computeBoundingBox();
            const centerOffset = -(textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x) / 2;
            const textMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0xffffff,
                emissiveIntensity: 0.5,
                metalness: 0,
                roughness: 0.2
            });

            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
            textMesh.position.set(centerOffset, -0.07, 0.16);
            this.startButton.add(textMesh);
        }

        // Add to scoreGroup
        this.scoreGroup.add(this.startButton);
    }

    updatePlayerScore(playerId, score, rank) {
        console.log(`[VR_SCORE_UI] Updating score for Player ${playerId}, Score: ${score}, Rank: ${rank}`);
        
        if (!this.font) {
            console.warn('[VR_SCORE_UI] Font not loaded yet, cannot update score');
            return;
        }

        // Clear old score text mesh
        if (this.textMeshes.has(playerId)) {
            const display = this.textMeshes.get(playerId);
            this.scoreGroup.remove(display.text);
            if (display.text.geometry) display.text.geometry.dispose();
            if (display.text.material) display.text.material.dispose();
            this.textMeshes.delete(playerId);
            console.log(`[VR_SCORE_UI] Removed old text mesh for Player ${playerId}`);
        }

        // Clear old player tag text mesh
        if (this.playerTagMeshes.has(playerId)) {
            const display = this.playerTagMeshes.get(playerId);
            this.playerTagsGroup.remove(display.text);
            if (display.text.geometry) display.text.geometry.dispose();
            if (display.text.material) display.text.material.dispose();
            this.playerTagMeshes.delete(playerId);
            console.log(`[VR_SCORE_UI] Removed old tag mesh for Player ${playerId}`);
        }

        // Calculate vertical positions
        const startY = 1.8;
        const spacing = 0.45;
        const tagYPosition = 0.9 - (rank * 0.2); // Adjusted position for side panel scores

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
        console.log(`[VR_SCORE_UI] Added text mesh for Player ${playerId} at position y=${startY - (rank * spacing)}`);

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
        console.log(`[VR_SCORE_UI] Added tag mesh for Player ${playerId} at position y=${tagYPosition}`);
        
        // Update positions for all scores to ensure proper layout
        this.repositionScores();
    }

    removePlayer(playerId) {
        console.log(`[VR_SCORE_UI] Removing player ${playerId}`);
        
        // Remove from main leaderboard
        if (this.textMeshes.has(playerId)) {
            const display = this.textMeshes.get(playerId);
            if (display.text) {
                this.scoreGroup.remove(display.text);
                if (display.text.geometry) display.text.geometry.dispose();
                if (display.text.material) display.text.material.dispose();
            }
            this.textMeshes.delete(playerId);
            console.log(`[VR_SCORE_UI] Removed main leaderboard entry for Player ${playerId}`);
        }

        // Remove from player tags
        if (this.playerTagMeshes.has(playerId)) {
            const display = this.playerTagMeshes.get(playerId);
            if (display.text) {
                this.playerTagsGroup.remove(display.text);
                if (display.text.geometry) display.text.geometry.dispose();
                if (display.text.material) display.text.material.dispose();
            }
            this.playerTagMeshes.delete(playerId);
            console.log(`[VR_SCORE_UI] Removed tag for Player ${playerId}`);
        }
        
        // Reposition remaining scores
        try {
            this.repositionScores();
        } catch (error) {
            console.error('[VR_SCORE_UI] Error repositioning scores after removal:', error);
        }
    }

    repositionScores() {
        const startY = 1.8;
        const spacing = 0.45;
        const tagStartY = 0.9; // Higher up to accommodate PLAYERS heading at the top
        const tagSpacing = 0.2;
        
        // Get players from ScoreManager directly for more reliability
        if (this.engine.scoreManager) {
            // Use the actual scores from ScoreManager instead of trying to parse from text
            const sortedScores = Array.from(this.engine.scoreManager.scores.entries())
                .sort((a, b) => b[1] - a[1]);
            
            console.log('[VR_SCORE_UI] Repositioning scores based on ScoreManager data:', 
                sortedScores.map(([id, score]) => `Player ${id}: ${score}`).join(', '));
            
            // Update positions based on new ranking
            sortedScores.forEach(([playerId, score], index) => {
                // Main panel scores positioning - unchanged
                if (this.textMeshes.has(playerId)) {
                    // Reposition main leaderboard text
                    const display = this.textMeshes.get(playerId);
                    const textMesh = display.text;
                    
                    // Only try to access geometry if it exists
                    if (textMesh && textMesh.geometry) {
                        try {
                            // Recalculate center offset
                            textMesh.geometry.computeBoundingBox();
                            const centerOffset = -(textMesh.geometry.boundingBox.max.x - textMesh.geometry.boundingBox.min.x) / 2;
                            
                            // Update position
                            const yPosition = startY - (index * spacing);
                            textMesh.position.set(centerOffset, yPosition, 0.02);
                            console.log(`[VR_SCORE_UI] Repositioned Player ${playerId} to rank ${index} at y=${yPosition}`);
                        } catch (error) {
                            console.error(`[VR_SCORE_UI] Error repositioning player ${playerId} text:`, error);
                        }
                    }
                }
                
                // Side panel tag positioning - adjusted for new headings
                if (this.playerTagMeshes.has(playerId)) {
                    // Reposition player tag text
                    const tagDisplay = this.playerTagMeshes.get(playerId);
                    const tagMesh = tagDisplay.text;
                    
                    // Only try to access geometry if it exists
                    if (tagMesh && tagMesh.geometry) {
                        try {
                            // Recalculate center offset
                            tagMesh.geometry.computeBoundingBox();
                            const tagCenterOffset = -(tagMesh.geometry.boundingBox.max.x - tagMesh.geometry.boundingBox.min.x) / 2;
                            
                            // Update position - adjusted for new headings
                            const tagYPosition = tagStartY - (index * tagSpacing);
                            tagMesh.position.set(tagCenterOffset, tagYPosition, 0.02);
                        } catch (error) {
                            console.error(`[VR_SCORE_UI] Error repositioning player ${playerId} tag:`, error);
                        }
                    }
                }
            });
        } else {
            console.warn('[VR_SCORE_UI] Cannot reposition scores - ScoreManager not available');
        }
    }

    update() {
        // Check for start button interaction only if we're the host
        if (this.startButton && !this.engine.uiManager.gameStarted && this.engine.networkManager?.isHost) {
            const session = this.engine.renderer.xr.getSession();
            
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
                    const raycaster = new THREE.Raycaster();
                    
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
                // Non-VR Mode interaction (only for host)
                const raycaster = new THREE.Raycaster();
                const mouse = this.engine.inputManager.mouse;
                
                // Convert mouse position to normalized device coordinates
                const mouseNDC = new THREE.Vector2(
                    (mouse.x / window.innerWidth) * 2 - 1,
                    -(mouse.y / window.innerHeight) * 2 + 1
                );

                // Update the picking ray with the camera and mouse position
                raycaster.setFromCamera(mouseNDC, this.engine.camera);

                // Check for intersections
                const intersects = raycaster.intersectObject(this.startButton, true);

                if (intersects.length > 0) {
                    this.startButton.material = this.startButton.userData.materials.hover;
                    if (this.engine.inputManager.mouseDown) {
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
        if (!this.font) {
            console.warn('[UI] Font not loaded yet, cannot update timer');
            return;
        }
        
        // Update main timer
        if (this.timerMesh) {
            // Create timer text geometry
            const timerGeometry = new TextGeometry(timeText, {
                font: this.font,
                size: 0.3,
                height: 0.03,
                curveSegments: 4,
                bevelEnabled: false
            });

            // Dispose of old geometry
            if (this.timerMesh.geometry) {
                this.timerMesh.geometry.dispose();
            }

            // Update geometry
            this.timerMesh.geometry = timerGeometry;
            
            // Position timer
            timerGeometry.computeBoundingBox();
            const centerOffset = -(timerGeometry.boundingBox.max.x - timerGeometry.boundingBox.min.x) / 2;
            this.timerMesh.position.set(centerOffset, -2.8, 0.01);
        }
        
        // Update side panel timer
        if (this.sidePanelTimerMesh) {
            // Create side panel timer text geometry
            const sideTimerGeometry = new TextGeometry(timeText, {
                font: this.font,
                size: 0.15, // Smaller size for side panel
                height: 0.015,
                curveSegments: 4,
                bevelEnabled: false
            });

            // Dispose of old geometry
            if (this.sidePanelTimerMesh.geometry) {
                this.sidePanelTimerMesh.geometry.dispose();
            }

            // Update geometry
            this.sidePanelTimerMesh.geometry = sideTimerGeometry;
            
            // Position timer
            sideTimerGeometry.computeBoundingBox();
            const sideCenterOffset = -(sideTimerGeometry.boundingBox.max.x - sideTimerGeometry.boundingBox.min.x) / 2;
            this.sidePanelTimerMesh.position.set(sideCenterOffset, -1.1, 0.01);
        }
        
        console.log('[UI] Timer updated to:', timeText);
    }

    async createSidePanelTimerDisplay() {
        console.log('[UI] Creating side panel timer display');
        if (!this.font) {
            console.warn('[UI] Font not loaded yet, cannot create side panel timer');
            return;
        }
        
        // Create TIME heading
        const headingGeometry = new TextGeometry('TIME', {
            font: this.font,
            size: 0.1,
            height: 0.01,
            curveSegments: 4,
            bevelEnabled: false
        });

        const headingMaterial = new THREE.MeshStandardMaterial({
            color: 0x4099ff,
            emissive: 0x4099ff,
            emissiveIntensity: 10.0,
            metalness: 0,
            roughness: 0,
            transparent: true,
            opacity: 1.0
        });

        const headingMesh = new THREE.Mesh(headingGeometry, headingMaterial);
        headingGeometry.computeBoundingBox();
        const headingCenterOffset = -(headingGeometry.boundingBox.max.x - headingGeometry.boundingBox.min.x) / 2;
        headingMesh.position.set(headingCenterOffset, -0.9, 0.01);
        this.playerTagsGroup.add(headingMesh);
        
        // Create timer text
        const timerGeometry = new TextGeometry('2:00', {
            font: this.font,
            size: 0.15, // Smaller size for side panel
            height: 0.015,
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

        // Create timer mesh for side panel
        this.sidePanelTimerMesh = new THREE.Mesh(timerGeometry, timerMaterial);
        timerGeometry.computeBoundingBox();
        const centerOffset = -(timerGeometry.boundingBox.max.x - timerGeometry.boundingBox.min.x) / 2;
        
        // Position at the bottom of the side panel
        this.sidePanelTimerMesh.position.set(centerOffset, -1.1, 0.01);
        this.playerTagsGroup.add(this.sidePanelTimerMesh);
        
        // Add a divider line
        const dividerGeometry = new THREE.PlaneGeometry(0.8, 0.01);
        const dividerMaterial = new THREE.MeshBasicMaterial({
            color: 0x4099ff,
            transparent: true,
            opacity: 0.7
        });
        const divider = new THREE.Mesh(dividerGeometry, dividerMaterial);
        divider.position.set(0, -0.75, 0.01);
        this.playerTagsGroup.add(divider);
        
        console.log('[UI] Side panel timer display initialized');
    }
}
