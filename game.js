// Game variables
let scene, camera, renderer, player, enemies = [], projectiles = [], bombs = [];
let keys = {}, mouse = { x: 0, y: 0 };
let health = 100, maxHealth = 100, playerName = '';
let gameStarted = false, gameOver = false;
const numEnemies = 5;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let collidables = []; // Array for walls and obstacles
const raycaster = new THREE.Raycaster();
const gridSize = 50; // For A* grid (0 to 49)
const gridOffset = 25; // Positions from -25 to 25
const cellSize = 1;
let blockedCells = new Set(); // For A* obstacles
let lastPathTime = 0; // For recomputing paths

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

    // Walls (outer arena)
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
        collidables.push(wall);
    });

    // Inner obstacles (pillars for pathfinding demo)
    const pillarGeometry = new THREE.BoxGeometry(2, 5, 2);
    const pillar1 = new THREE.Mesh(pillarGeometry, wallMaterial);
    pillar1.position.set(10, 2.5, 0);
    const pillar2 = new THREE.Mesh(pillarGeometry, wallMaterial);
    pillar2.position.set(-10, 2.5, 10);
    [pillar1, pillar2].forEach(pillar => {
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        scene.add(pillar);
        collidables.push(pillar);
    });

    // Mark blocked cells for A*
    initBlockedCells();

    // Player (invisible, camera is player)
    player = camera; // For simplicity

    // Enemies
    for (let i = 0; i < numEnemies; i++) {
        const enemyGeometry = new THREE.BoxGeometry(1, 2, 1);
        const enemyMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
        const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
        enemy.position.set((Math.random() - 0.5) * 40, 1, (Math.random() - 0.5) * 40);
        enemy.castShadow = true;
        enemy.userData = { health: 50, path: [], currentPathIndex: 0, lastPathTime: 0 };
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

// Initialize blocked cells for A* (outer walls and pillars)
function initBlockedCells() {
    // Outer walls: block grid borders
    for (let x = 0; x < gridSize; x++) {
        blockedCells.add(`${x},0`); // South
        blockedCells.add(`${x},${gridSize-1}`); // North
    }
    for (let z = 0; z < gridSize; z++) {
        blockedCells.add(`0,${z}`); // West
        blockedCells.add(`${gridSize-1},${z}`); // East
    }
    // Pillar1 at (10,0) -> grid (35,25) approx (x+25, z+25)
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            blockedCells.add(`${Math.floor(10 + gridOffset + dx)},${Math.floor(0 + gridOffset + dz)}`);
            blockedCells.add(`${Math.floor(-10 + gridOffset + dx)},${Math.floor(10 + gridOffset + dz)}`);
        }
    }
}

// Position to grid coord
function posToGrid(pos) {
    return {
        x: Math.floor(pos.x + gridOffset),
        z: Math.floor(pos.z + gridOffset)
    };
}

// Grid to position
function gridToPos(gx, gz) {
    return new THREE.Vector3(gx - gridOffset + 0.5, 1, gz - gridOffset + 0.5); // Center of cell
}

// A* pathfinding
function findPath(start, goal) {
    const openSet = [];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const startKey = `${start.x},${start.z}`;
    openSet.push(start);
    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(start, goal));

    while (openSet.length > 0) {
        openSet.sort((a, b) => fScore.get(`${a.x},${a.z}`) - fScore.get(`${b.x},${b.z}`));
        const current = openSet.shift();
        const currentKey = `${current.x},${current.z}`;

        if (current.x === goal.x && current.z === goal.z) {
            return reconstructPath(cameFrom, current);
        }

        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.z}`;
            const tentativeG = gScore.get(currentKey) + 1; // Distance 1 per cell

            if (tentativeG < (gScore.get(neighborKey) || Infinity)) {
                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentativeG);
                fScore.set(neighborKey, tentativeG + heuristic(neighbor, goal));
                if (!openSet.some(n => n.x === neighbor.x && n.z === neighbor.z)) {
                    openSet.push(neighbor);
                }
            }
        }
    }
    return []; // No path
}

function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.z - b.z); // Manhattan
}

function getNeighbors(node) {
    const dirs = [{x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}]; // 4-way
    return dirs.map(d => ({x: node.x + d.x, z: node.z + d.z}))
               .filter(n => n.x >= 0 && n.x < gridSize && n.z >= 0 && n.z < gridSize && !blockedCells.has(`${n.x},${n.z}`));
}

function reconstructPath(cameFrom, current) {
    const path = [current];
    let currentKey = `${current.x},${current.z}`;
    while (cameFrom.has(currentKey)) {
        current = cameFrom.get(currentKey);
        currentKey = `${current.x},${current.z}`;
        path.unshift(current);
    }
    return path;
}

// Input handlers (unchanged)
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

// Shooting (player) - unchanged
function shoot() {
    const bulletGeometry = new THREE.SphereGeometry(0.1);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(camera.position);
    bullet.userData = { velocity: new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(2), isPlayer: true };
    scene.add(bullet);
    projectiles.push(bullet);
}

// Update enemies with pathfinding
function updateEnemies() {
    const now = performance.now();
    enemies.forEach((enemy, index) => {
        if (enemy.userData.health <= 0) {
            scene.remove(enemy);
            enemies.splice(index, 1);
            return;
        }

        // Recompute path every 1 second or if no path
        if (now - enemy.userData.lastPathTime > 1000 || enemy.userData.path.length === 0) {
            const startGrid = posToGrid(enemy.position);
            const goalGrid = posToGrid(camera.position);
            enemy.userData.path = findPath(startGrid, goalGrid).map(p => gridToPos(p.x, p.z));
            enemy.userData.currentPathIndex = 0;
            enemy.userData.lastPathTime = now;
        }

        // Follow path
        if (enemy.userData.path.length > 0 && enemy.userData.currentPathIndex < enemy.userData.path.length) {
            const target = enemy.userData.path[enemy.userData.currentPathIndex];
            const dir = new THREE.Vector3().subVectors(target, enemy.position).normalize();
            const move = dir.clone().multiplyScalar(0.02);

            // Check collision before moving
            if (!checkCollision(enemy.position, move, 0.5)) { // 0.5 radius
                enemy.position.add(move);
            }

            if (enemy.position.distanceTo(target) < 0.1) {
                enemy.userData.currentPathIndex++;
            }
        }

        // Randomly shoot
        if (Math.random() < 0.01) shootEnemy(enemy, true); // Bullet
        if (Math.random() < 0.005) shootEnemy(enemy, false); // Bomb
    });

    if (enemies.length === 0) winLevel();
}

// Collision check using raycasting
function checkCollision(position, direction, radius) {
    const dirs = [direction.normalize()]; // Main direction
    // Add side rays for better detection
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0,1,0)).normalize().multiplyScalar(radius);
    dirs.push(direction.clone().add(right).normalize());
    dirs.push(direction.clone().sub(right).normalize());

    for (const dir of dirs) {
        raycaster.set(position, dir);
        const intersects = raycaster.intersectObjects(collidables);
        if (intersects.length > 0 && intersects[0].distance < radius + 0.1) {
            return true; // Collision
        }
    }
    return false;
}

// Enemy shoot - unchanged
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

// Update projectiles and bombs - unchanged, but add collision with walls for projectiles?
// For simplicity, let them pass or remove on hit, but skipped for now

function updateProjectiles() {
    // Player bullets
    projectiles = projectiles.filter(proj => {
        if (proj.userData.isPlayer) {
            proj.position.add(proj.userData.velocity);
            // Check enemy hits
            enemies.forEach(enemy => {
                if (proj.position.distanceTo(enemy.position) < 1) {
                    enemy.userData.health -= 25;
                    scene.remove(proj);
                    return false;
                }
            });
            // Check wall hits (remove bullet)
            raycaster.set(proj.position, proj.userData.velocity.normalize());
            if (raycaster.intersectObjects(collidables).length > 0) {
                scene.remove(proj);
                return false;
            }
            if (proj.position.length() > 100) {
                scene.remove(proj);
                return false;
            }
        }
        return true;
    });

    // Enemy projectiles/bombs
    [...projectiles, ...bombs].forEach(proj => {
        proj.position.add(proj.userData.velocity);
        // Check player hit
        if (proj.position.distanceTo(camera.position) < (proj.userData.isBomb ? 1.5 : 1)) {
            health -= proj.userData.damage;
            if (proj.userData.isBomb) explode(proj.position, proj.userData.explosionRadius);
            scene.remove(proj);
            return;
        }
        // Check wall hits
        raycaster.set(proj.position, proj.userData.velocity.normalize());
        if (raycaster.intersectObjects(collidables).length > 0) {
            scene.remove(proj);
        }
    });

    updateHealth();
    if (health <= 0) gameOverScreen('You got bombed! Game Over.');
}

// Explosion effect - unchanged
function explode(pos, radius) {
    for (let i = 0; i < 10; i++) {
        const particle = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xff4500 }));
        particle.position.copy(pos);
        particle.userData.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() + 0.5, Math.random() - 0.5).multiplyScalar(0.5);
        scene.add(particle);
        setTimeout(() => scene.remove(particle), 1000);
    }
}

// Movement with collision
function updateMovement() {
    velocity.set(0, velocity.y, 0); // Reset x/z, keep y for jump/gravity

    direction.set(0, 0, 0);
    if (keys['KeyW'] || keys['ArrowUp']) direction.z -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) direction.z += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) direction.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) direction.x += 1;

    direction.normalize();
    velocity.add(direction.multiplyScalar(0.1)); // Speed

    if (keys['Space']) velocity.y += 0.2; // Jump
    velocity.y -= 0.01; // Gravity

    // Check collision for x/z movement
    const moveXZ = new THREE.Vector3(velocity.x, 0, velocity.z);
    if (!checkCollision(camera.position, moveXZ, 0.5)) {
        camera.position.add(moveXZ);
    }

    // Y movement (no floor collision beyond clamp)
    camera.position.y += velocity.y;
    camera.position.y = Math.max(1.6, camera.position.y); // Ground clamp
}

// UI Updates - unchanged
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
