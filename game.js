// Game variables
let scene, camera, renderer, player, enemies = [], projectiles = [], bombs = [];
let keys = {}, mouse = { x: 0, y: 0 };
let health = 100, maxHealth = 100, playerName = '';
let gameStarted = false, gameOver = false;
const numEnemies = 5;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Name input
document.getElementById('startGame').addEventListener('click', () => {
    playerName = document.getElementById('playerName').value.trim() || 'Soldier';
    if (playerName) {
        document.getElementById('nameScreen').style.display = 'none';
        document.getElementById('nameDisplay').textContent = `Player: ${playerName}`;
        initGame();
    }
});

// Initialize Three.js
function initGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0); // Eye height

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Walls (simple arena)
    const wallGeometry = new THREE.BoxGeometry(50, 5, 1);
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const walls = [
        new THREE.Mesh(wallGeometry, wallMaterial), // North
        new THREE.Mesh(wallGeometry, wallMaterial), // South
        new THREE.Mesh(new THREE.BoxGeometry(1, 5, 50), wallMaterial), // East
        new THREE.Mesh(new THREE.BoxGeometry(1, 5, 50), wallMaterial)  // West
    ];
    walls[0].position.set(0, 2.5, -25);
    walls[1].position.set(0, 2.5, 25);
    walls[2].position.set(25, 2.5, 0);
    walls[3].position.set(-25, 2.5, 0);
    walls.forEach(wall => {
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
    });

    // Player (invisible, camera is player)
    player = camera; // For simplicity

    // Enemies
    for (let i = 0; i < numEnemies; i++) {
        const enemyGeometry = new THREE.BoxGeometry(1, 2, 1);
        const enemyMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
        const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
        enemy.position.set((Math.random() - 0.5) * 40, 1, (Math.random() - 0.5) * 40);
        enemy.castShadow = true;
        enemy.userData = { health: 50, ai: { direction: new THREE.Vector3() } };
        scene.add(enemy);
        enemies.push(enemy);
    }

    // Event listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    renderer.domElement.addEventListener('click', onMouseClick, false);
    renderer.domElement.addEventListener('mousemove', onMouseMove, false);
    renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());

    gameStarted = true;
    animate();
}

// Input handlers
function onKeyDown(event) {
    keys[event.code] = true;
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onMouseMove(event) {
    if (document.pointerLockElement === renderer.domElement) {
        mouse.x -= event.movementX * 0.002;
        mouse.y -= event.movementY * 0.002;
        mouse.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouse.y));
        camera.rotation.order = 'YXZ';
        camera.rotation.y = mouse.x;
        camera.rotation.x = mouse.y;
    }
}

function onMouseClick() {
    if (!gameOver) shoot();
}

// Shooting (player)
function shoot() {
    const bulletGeometry = new THREE.SphereGeometry(0.1);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(camera.position);
    bullet.userData = { velocity: new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(2), isPlayer: true };
    scene.add(bullet);
    projectiles.push(bullet);
}

// Enemy AI: Move towards player, shoot occasionally
function updateEnemies() {
    enemies.forEach((enemy, index) => {
        if (enemy.userData.health <= 0) {
            scene.remove(enemy);
            enemies.splice(index, 1);
            return;
        }

        // Simple chase AI
        const dir = new THREE.Vector3().subVectors(camera.position, enemy.position).normalize();
        enemy.userData.ai.direction.copy(dir);
        enemy.position.add(dir.multiplyScalar(0.02)); // Slow chase

        // Randomly shoot bullet or bomb
        if (Math.random() < 0.01) shootEnemy(enemy, true); // Bullet
        if (Math.random() < 0.005) shootEnemy(enemy, false); // Bomb
    });

    if (enemies.length === 0) winLevel();
}

// Enemy shoot
function shootEnemy(enemy, isBullet) {
    const projGeometry = isBullet ? new THREE.SphereGeometry(0.05) : new THREE.SphereGeometry(0.2);
    const projMaterial = new THREE.MeshBasicMaterial({ color: isBullet ? 0xff0000 : 0x000000 });
    const proj = new THREE.Mesh(projGeometry, projMaterial);
    proj.position.copy(enemy.position);
    const dir = new THREE.Vector3().subVectors(camera.position, enemy.position).normalize();
    proj.userData = { velocity: dir.multiplyScalar(isBullet ? 0.5 : 0.3), isBomb: !isBullet, damage: isBullet ? 10 : 30, explosionRadius: isBullet ? 0 : 3 };
    scene.add(proj);
    (isBullet ? projectiles : bombs).push(proj);
}

// Update projectiles and bombs
function updateProjectiles() {
    // Player bullets
    projectiles = projectiles.filter(proj => {
        if (proj.userData.isPlayer) {
            proj.position.add(proj.userData.velocity);
            // Check enemy hits
            enemies.forEach((enemy, index) => {
                if (proj.position.distanceTo(enemy.position) < 1) {
                    enemy.userData.health -= 25;
                    scene.remove(proj);
                    return false;
                }
            });
            if (proj.position.length() > 100) {
                scene.remove(proj);
                return false;
            }
        }
        return true;
    });

    // Enemy projectiles/bombs
    [...projectiles, ...bombs].forEach((proj, index) => {
        if (proj.userData.isBomb) {
            // Bomb logic: explode on player hit
            proj.position.add(proj.userData.velocity);
            if (proj.position.distanceTo(camera.position) < 1.5) {
                health -= proj.userData.damage;
                explode(proj.position, proj.userData.explosionRadius);
                scene.remove(proj);
                return;
            }
        } else {
            proj.position.add(proj.userData.velocity);
            if (proj.position.distanceTo(camera.position) < 1) {
                health -= proj.userData.damage;
                scene.remove(proj);
                return;
            }
        }
        if (proj.position.length() > 100) scene.remove(proj);
    });

    updateHealth();
    if (health <= 0) gameOverScreen('You got bombed! Game Over.');
}

// Explosion effect (simple particle)
function explode(pos, radius) {
    for (let i = 0; i < 10; i++) {
        const particle = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xff4500 }));
        particle.position.copy(pos);
        particle.userData.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() + 0.5, Math.random() - 0.5).multiplyScalar(0.5);
        scene.add(particle);
        setTimeout(() => scene.remove(particle), 1000);
    }
}

// Movement
function updateMovement() {
    velocity.set(0, 0, 0);

    if (keys['KeyW'] || keys['ArrowUp']) velocity.z -= 0.1;
    if (keys['KeyS'] || keys['ArrowDown']) velocity.z += 0.1;
    if (keys['KeyA'] || keys['ArrowLeft']) velocity.x -= 0.1;
    if (keys['KeyD'] || keys['ArrowRight']) velocity.x += 0.1;
    if (keys['Space']) velocity.y += 0.2; // Jump (simple, no gravity for brevity)

    velocity.applyQuaternion(camera.quaternion);
    velocity.y -= 0.01; // Basic gravity
    camera.position.add(velocity);
    camera.position.y = Math.max(1.6, camera.position.y); // Ground clamp
}

// UI Updates
function updateHealth() {
    const fill = document.getElementById('healthFill');
    fill.style.width = (health / maxHealth * 200) + 'px';
    fill.style.background = health > 50 ? '#4CAF50' : health > 20 ? '#FF9800' : '#f44336';
}

function winLevel() {
    gameOverScreen(`${playerName} beat the level! All enemies defeated.`);
}

function gameOverScreen(message) {
    gameOver = true;
    document.getElementById('gameMessage').textContent = message;
    document.getElementById('gameOver').classList.remove('hidden');
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (gameStarted && !gameOver) {
        updateMovement();
        updateEnemies();
        updateProjectiles();
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
