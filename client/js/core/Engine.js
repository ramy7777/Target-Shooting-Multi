import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { InputManager } from '../input/InputManager.js';
import { World } from '../world/World.js';
import { PlayerManager } from '../entities/PlayerManager.js';
import { SessionManager } from '../managers/SessionManager.js';
import { BulletManager } from '../managers/BulletManager.js';
import { BirdManager } from '../managers/BirdManager.js';
import { ScoreManager } from '../managers/ScoreManager.js';
import { UIManager } from '../managers/UIManager.js';
import { VoiceManager } from '../managers/VoiceManager.js';
import AudioManager from '../managers/AudioManager.js';
import { ParticleManager } from '../managers/ParticleManager.js';

export class Engine {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x404040);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Create camera rig for VR and PC
        this.cameraRig = new THREE.Group();
        this.cameraRig.position.set(0, 1.6, 3);
        this.cameraRig.add(this.camera);
        this.scene.add(this.cameraRig);

        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        // Enable WebGL optimizations
        this.renderer.physicallyCorrectLights = true;
        this.renderer.powerPreference = "high-performance";
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Add VR button
        const vrButton = VRButton.createButton(this.renderer);
        document.body.appendChild(vrButton);

        // Setup OrbitControls for PC
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1.6, 0);
        this.controls.update();

        this.clock = new THREE.Clock();

        this.setupLights();
        
        // Initialize managers
        this.inputManager = new InputManager(this);
        this.bulletManager = new BulletManager(this);
        this.birdManager = new BirdManager(this);
        this.networkManager = new NetworkManager(this);
        
        // Initialize network connection
        this.networkManager.connect().then(() => {
            console.log('[ENGINE] Successfully connected to server');
        }).catch(error => {
            console.error('[ENGINE] Failed to connect to server:', error);
        });
        
        this.scoreManager = new ScoreManager(this);
        this.uiManager = new UIManager(this);
        this.playerManager = new PlayerManager(this);
        this.sessionManager = new SessionManager(this);
        this.audioManager = new AudioManager(); // Initialize AudioManager
        this.particleManager = new ParticleManager(this);
        this.world = new World(this);
        this.voiceManager = new VoiceManager(this);

        // Setup network events after connection
        this.networkManager.onConnect = () => {
            this.networkManager.ws.addEventListener('message', (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'id' && !this.playerManager.localPlayer) {
                    this.playerManager.createLocalPlayer();
                }
            });
        };

        // Setup window resize handler
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Log XR session changes
        this.renderer.xr.addEventListener('sessionstart', () => {
            this.controls.enabled = false; // Disable OrbitControls in VR
        });

        this.renderer.xr.addEventListener('sessionend', () => {
            this.controls.enabled = true; // Re-enable OrbitControls when exiting VR
            // Reset camera rig position for PC view
            this.cameraRig.position.set(0, 1.6, 3);
            this.cameraRig.rotation.set(0, 0, 0);
            this.controls.target.set(0, 1.6, 0);
            this.controls.update();
        });

        this.initXR();
    }

    async initXR() {
        try {
            // Add button container if it doesn't exist
            let buttonContainer = document.getElementById('xr-buttons');
            if (!buttonContainer) {
                buttonContainer = document.createElement('div');
                buttonContainer.id = 'xr-buttons';
                buttonContainer.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    gap: 10px;
                    z-index: 1000;
                `;
                document.body.appendChild(buttonContainer);
            }

            // Check and create VR button
            const isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
            if (isVRSupported) {
                const vrButton = this.createXRButton('Enter VR', 'immersive-vr');
                buttonContainer.appendChild(vrButton);
            }

            // Check and create AR button
            const isARSupported = await navigator.xr.isSessionSupported('immersive-ar');
            if (isARSupported) {
                const arButton = this.createXRButton('Enter AR', 'immersive-ar');
                buttonContainer.appendChild(arButton);
            }

        } catch (error) {
            console.error('Error initializing XR:', error);
        }
    }

    async onXRSessionStarted(session, mode) {
        this.xrSession = session;
        this.xrMode = mode;

        try {
            // Make WebGL context XR compatible
            const gl = this.renderer.getContext();
            await gl.makeXRCompatible();

            // Create the WebGL layer with alpha for AR
            const glLayer = new XRWebGLLayer(session, gl, {
                alpha: true,
                framebufferScaleFactor: 1.0
            });

            await session.updateRenderState({ 
                baseLayer: glLayer,
                depthFar: 1000,
                depthNear: 0.1
            });

            // Set up reference space
            const referenceSpaceType = mode === 'immersive-ar' ? 'local' : 'local-floor';
            this.xrRefSpace = await session.requestReferenceSpace(referenceSpaceType);

            // Initialize hit testing for AR
            if (mode === 'immersive-ar') {
                await this.initARHitTesting(session);
                
                // Configure renderer for AR transparency
                this.renderer.setClearAlpha(0);
                this.renderer.setClearColor(0x000000, 0);
                this.scene.background = null;
            } else {
                // Reset for VR mode
                this.renderer.setClearAlpha(1);
                this.renderer.setClearColor(0x000000, 1);
                // You might want to set a skybox or background color for VR
                this.scene.background = new THREE.Color(0x000000);
            }

            // Configure renderer for XR
            this.renderer.xr.setReferenceSpaceType(referenceSpaceType);
            this.renderer.xr.setSession(session);

        } catch (error) {
            console.error('Error setting up XR session:', error);
            session.end();
        }
    }

    onXRSessionEnded() {
        // Reset renderer settings
        this.renderer.setClearAlpha(1);
        this.renderer.setClearColor(0x000000, 1);
        this.scene.background = new THREE.Color(0x000000);

        if (this.hitTestSource) {
            this.hitTestSource.cancel();
            this.hitTestSource = null;
        }
        this.xrSession = null;
        this.xrMode = null;
    }

    createXRButton(buttonText, mode) {
        const button = document.createElement('button');
        button.style.cssText = `
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            background: #4CAF50;
            color: white;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 16px;
            cursor: pointer;
            transition: background-color 0.3s;
        `;
        button.textContent = buttonText;

        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#45a049';
        });

        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = '#4CAF50';
        });

        button.addEventListener('click', async () => {
            try {
                if (this.xrSession) {
                    await this.xrSession.end();
                    return;
                }

                const sessionInit = {
                    requiredFeatures: ['local'],
                    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
                };

                // Add AR-specific features
                if (mode === 'immersive-ar') {
                    sessionInit.requiredFeatures.push('hit-test');
                    sessionInit.optionalFeatures.push('light-estimation');
                    sessionInit.optionalFeatures.push('anchors');
                    sessionInit.domOverlay = { root: document.body };
                }

                const session = await navigator.xr.requestSession(mode, sessionInit);
                await this.onXRSessionStarted(session, mode);
                button.textContent = `Exit ${mode === 'immersive-vr' ? 'VR' : 'AR'}`;
                
                session.addEventListener('end', () => {
                    button.textContent = buttonText;
                    this.onXRSessionEnded();
                });
            } catch (error) {
                console.error(`Error starting ${mode} session:`, error);
            }
        });

        return button;
    }

    async initARHitTesting(session) {
        try {
            const viewerSpace = await session.requestReferenceSpace('viewer');
            this.hitTestSource = await session.requestHitTestSource({
                space: viewerSpace
            });
            console.log('Hit testing initialized');
        } catch (error) {
            console.error('Error initializing hit testing:', error);
        }
    }

    setupLights() {
        // Add ambient light with slightly blue tint
        const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
        this.scene.add(ambientLight);

        // Add directional light with warm tint
        const directionalLight = new THREE.DirectionalLight(0xfff0e0, 1.2);
        directionalLight.position.set(5, 8, 3);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.bias = -0.0001;
        this.scene.add(directionalLight);

        // Add hemisphere light for subtle color variation
        const hemiLight = new THREE.HemisphereLight(0x606090, 0x202040, 0.5);
        this.scene.add(hemiLight);
    }

    start() {
        this.renderer.setAnimationLoop((time, frame) => this.update(time, frame));
    }

    update(time, frame) {
        const delta = this.clock.getDelta();

        // Update all managers
        this.inputManager.update(delta, frame);
        this.playerManager.update(delta, frame);
        this.bulletManager.update(delta);
        this.birdManager.update(delta);
        this.uiManager.update();
        this.scoreManager.update(delta);
        this.world.update();
        this.particleManager.update();

        // Update OrbitControls only if not in VR
        if (!this.renderer.xr.isPresenting) {
            this.controls.update();
        }

        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }

    handleNetworkMessage(message, senderId) {
        switch (message.type) {
            case 'gameStart':
                this.uiManager.handleNetworkGameStart(message.data);
                break;
            case 'gameEnd':
                this.uiManager.handleNetworkGameEnd(message.data);
                break;
        }
    }
}
