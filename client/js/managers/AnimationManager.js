export class AnimationManager {
    constructor(engine) {
        this.engine = engine;
        this.animations = new Set();
    }

    addAnimation(animation) {
        this.animations.add(animation);
    }

    removeAnimation(animation) {
        this.animations.delete(animation);
    }

    update() {
        this.animations.forEach(animation => {
            animation();
        });
    }

    cleanup() {
        this.animations.clear();
    }
}
