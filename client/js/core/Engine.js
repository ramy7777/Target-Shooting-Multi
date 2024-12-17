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
            case 'timerSync':
                this.uiManager.handleTimerSync(message.data);
                break;
        }
    }
}
