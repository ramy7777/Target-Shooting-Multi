import * as THREE from 'three';

export class Paddle {
    constructor(engine, isLeft) {
        this.engine = engine;
        this.isLeft = isLeft;
        this.speed = 2; // Movement speed
        this.grabbed = false;
        
        // Create paddle mesh (thin rectangular box)
        const geometry = new THREE.BoxGeometry(0.05, 0.1, 0.3); // Thin, tall rectangle
        const material = new THREE.MeshPhongMaterial({
            color: 0x00ff00,
            emissive: 0x004400,
            shininess: 30,
            specular: 0x444444
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = 0.675; // Same height as ball
        
        // Position paddle on the correct edge
        const platformLength = 2.145;
        this.mesh.position.x = (isLeft ? -1 : 1) * (platformLength / 2);
        
        this.engine.scene.add(this.mesh);
        
        // Add grab interactivity
        this.mesh.userData.grabbable = true;
        this.mesh.userData.onGrab = (controller) => this.onGrab(controller);
        this.mesh.userData.onRelease = () => this.onRelease();
    }

    onGrab(controller) {
        this.grabbed = true;
        this.activeController = controller;
    }

    onRelease() {
        this.grabbed = false;
        this.activeController = null;
    }

    update() {
        if (this.grabbed && this.activeController) {
            // Get controller position in world space
            const controllerPos = new THREE.Vector3();
            this.activeController.getWorldPosition(controllerPos);
            
            // Update paddle z-position based on controller, but constrain to platform edges
            const platformWidth = 1.32;
            const maxZ = platformWidth / 2 - 0.15; // Half paddle width buffer
            const newZ = THREE.MathUtils.clamp(controllerPos.z, -maxZ, maxZ);
            this.mesh.position.z = newZ;
            
            // Keep x position fixed at edge
            const platformLength = 2.145;
            this.mesh.position.x = (this.isLeft ? -1 : 1) * (platformLength / 2);
            
            // Keep y position constant
            this.mesh.position.y = 0.675;
        }
    }

    // Check if ball collides with paddle and reflect it
    checkBallCollision(ball) {
        const paddleBounds = new THREE.Box3().setFromObject(this.mesh);
        const ballBounds = new THREE.Box3().setFromObject(ball.mesh);
        
        if (paddleBounds.intersectsBox(ballBounds)) {
            // Calculate reflection angle based on where the ball hits the paddle
            const hitPoint = (ball.mesh.position.z - this.mesh.position.z) / 0.15; // -1 to 1
            const reflectionAngle = hitPoint * Math.PI / 4; // -45 to 45 degrees
            
            // Set new direction
            if (this.isLeft) {
                ball.direction.set(
                    Math.cos(reflectionAngle),
                    0,
                    Math.sin(reflectionAngle)
                );
            } else {
                ball.direction.set(
                    -Math.cos(reflectionAngle),
                    0,
                    Math.sin(reflectionAngle)
                );
            }
            ball.direction.normalize();
            
            // Move ball out of collision
            ball.mesh.position.x = this.mesh.position.x + (this.isLeft ? 0.1 : -0.1);
            
            return true;
        }
        return false;
    }

    dispose() {
        if (this.mesh) {
            this.engine.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}
