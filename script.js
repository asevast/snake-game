const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('highScore');
const gameOverElement = document.getElementById('gameOverlay');
const startOverlayElement = document.getElementById('startOverlay');
const restartButton = document.getElementById('restartBtn');
const startButton = document.getElementById('startBtn');
const pauseButton = document.getElementById('pauseBtn');
const themeToggle = document.getElementById('themeToggle');
const difficultySelect = document.getElementById('difficulty');
const finalScoreElement = document.getElementById('finalScore');
const overlayTitle = document.getElementById('overlayTitle');
const themeIcon = themeToggle.querySelector('.theme-icon');

// Configuration
const CONFIG = {
    gridSize: 20,
    initialSpeed: 100,
    minSpeed: 50,
    speedDecrease: 2,
    minSwipeDistance: 30,
    MAX_PARTICLES: 200,
    particle: {
        minSize: 4,
        maxSize: 10,
        minDecay: 0.02,
        maxDecay: 0.05,
        gravity: 0.3
    },
    foodTypes: [
        { type: 'normal', color: '#e74c3c', points: 10, chance: 0.7 },
        { type: 'golden', color: '#f1c40f', points: 30, chance: 0.2 },
        { type: 'rainbow', color: '#9b59b6', points: 50, chance: 0.1 }
    ],
    difficulty: {
        easy: { speedMultiplier: 1.5, scoreMultiplier: 1 },
        medium: { speedMultiplier: 1, scoreMultiplier: 1.5 },
        hard: { speedMultiplier: 0.7, scoreMultiplier: 2 }
    },
    colors: {
        light: {
            snakeHead: '#2ecc71',
            snakeBody: '#27ae60',
            grid: '#e0e0e0',
            text: '#333'
        },
        dark: {
            snakeHead: '#27ae60',
            snakeBody: '#229954',
            grid: '#444',
            text: '#fff'
        }
    }
};

// Game State
const gameState = {
    snake: [{ x: 10, y: 10 }],
    food: null,
    direction: 'right',
    nextDirection: 'right',
    inputBuffer: [],
    score: 0,
    highScore: 0,
    isGameOver: false,
    isRunning: false,
    isPaused: false,
    lastTime: 0,
    accumulator: 0,
    currentSpeed: CONFIG.initialSpeed,
    theme: 'light',
    difficulty: 'medium',
    touchStartX: null,
    touchStartY: null,
    particles: []
};

// Audio
let audioContext = null;

const getAudioContext = () => {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Audio not supported');
            return null;
        }
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
};

const playSound = (type) => {
    const ctx = getAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    switch (type) {
        case 'eat':
            oscillator.frequency.setValueAtTime(440, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.1);
            break;
        case 'golden':
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(523.25, ctx.currentTime);
            oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.3);
            break;
        case 'gameover':
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(440, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.5);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.5);
            break;
        case 'milestone':
            oscillator.type = 'square';
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.2);
                osc.start(ctx.currentTime + i * 0.1);
                osc.stop(ctx.currentTime + i * 0.1 + 0.2);
            });
            break;
        case 'pause':
            oscillator.frequency.setValueAtTime(330, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.15);
            break;
    }
};

// Storage
const Storage = {
    KEY_HIGH_SCORE: 'snake_high_score',
    KEY_THEME: 'snake_theme',

    loadHighScore() {
        const saved = localStorage.getItem(this.KEY_HIGH_SCORE);
        const parsed = saved ? parseInt(saved, 10) : 0;
        return Number.isFinite(parsed) ? parsed : 0;
    },

    saveHighScore(score) {
        localStorage.setItem(this.KEY_HIGH_SCORE, score.toString());
    },

    loadTheme() {
        return localStorage.getItem(this.KEY_THEME) || 'light';
    },

    saveTheme(theme) {
        localStorage.setItem(this.KEY_THEME, theme);
    }
};

// Particle class
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * (CONFIG.particle.maxSize - CONFIG.particle.minSize) + CONFIG.particle.minSize;
        this.speedX = (Math.random() - 0.5) * 6;
        this.speedY = (Math.random() - 0.5) * 6;
        this.decay = Math.random() * (CONFIG.particle.maxDecay - CONFIG.particle.minDecay) + CONFIG.particle.minDecay;
        this.alpha = 1;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.speedY += CONFIG.particle.gravity;
        this.alpha -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

const createParticles = (x, y, color, count = 10) => {
    const availableSlots = Math.max(0, CONFIG.MAX_PARTICLES - gameState.particles.length);
    const actualCount = Math.min(count, availableSlots);
    for (let i = 0; i < actualCount; i++) {
        gameState.particles.push(new Particle(x, y, color));
    }
};

const updateParticles = () => {
    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        gameState.particles[i].update();
        if (gameState.particles[i].alpha <= 0) {
            gameState.particles.splice(i, 1);
        }
    }
};

const drawParticles = () => {
    gameState.particles.forEach(particle => particle.draw(ctx));
};

// Gradient cache
const gradientCache = {
    light: {},
    dark: {}
};

const getGradient = (theme, type, x, y, size) => {
    const cacheKey = `${type}-${x}-${y}-${size}`;
    if (!gradientCache[theme][cacheKey]) {
        const colors = CONFIG.colors[theme];
        const gradient = ctx.createRadialGradient(
            x + size / 2, y + size / 2, 0,
            x + size / 2, y + size / 2, size
        );
        if (type === 'head') {
            gradient.addColorStop(0, colors.snakeHead);
            gradient.addColorStop(1, colors.snakeBody);
        } else {
            gradient.addColorStop(0, colors.snakeBody);
            gradient.addColorStop(1, '#1e8449');
        }
        gradientCache[theme][cacheKey] = gradient;
    }
    return gradientCache[theme][cacheKey];
};

const clearGradientCache = () => {
    gradientCache.light = {};
    gradientCache.dark = {};
};

// Game functions
const generateFood = () => {
    const availablePositions = [];
    for (let x = 0; x < canvas.width / CONFIG.gridSize; x++) {
        for (let y = 0; y < canvas.height / CONFIG.gridSize; y++) {
            const onSnake = gameState.snake.some(segment => segment.x === x && segment.y === y);
            if (!onSnake) {
                availablePositions.push({ x, y });
            }
        }
    }

    if (availablePositions.length === 0) {
        gameWin();
        return;
    }

    const rand = Math.random();
    let cumulativeChance = 0;
    let selectedType = CONFIG.foodTypes[0];

    for (const foodType of CONFIG.foodTypes) {
        cumulativeChance += foodType.chance;
        if (rand <= cumulativeChance) {
            selectedType = foodType;
            break;
        }
    }

    const position = availablePositions[Math.floor(Math.random() * availablePositions.length)];
    gameState.food = {
        x: position.x,
        y: position.y,
        type: selectedType.type,
        color: selectedType.color,
        points: selectedType.points
    };
};

const drawGrid = () => {
    const colors = CONFIG.colors[gameState.theme];
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= canvas.width; x += CONFIG.gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += CONFIG.gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
};

const drawSnake = () => {
    const colors = CONFIG.colors[gameState.theme];

    gameState.snake.forEach((segment, index) => {
        const x = segment.x * CONFIG.gridSize;
        const y = segment.y * CONFIG.gridSize;
        const isHead = index === 0;

        const gradient = getGradient(gameState.theme, isHead ? 'head' : 'body', x, y, CONFIG.gridSize);
        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, CONFIG.gridSize - 2, CONFIG.gridSize - 2, isHead ? 6 : 4);
        ctx.fill();

        if (isHead) {
            drawEyes(x, y);
        }
    });
};

const drawEyes = (x, y) => {
    ctx.fillStyle = 'white';

    let eye1X, eye1Y, eye2X, eye2Y;
    const eyeOffset = 5;
    const eyeSize = 4;

    switch (gameState.direction) {
        case 'up':
            eye1X = x + eyeOffset;
            eye1Y = y + eyeOffset;
            eye2X = x + CONFIG.gridSize - eyeOffset - eyeSize;
            eye2Y = y + eyeOffset;
            break;
        case 'down':
            eye1X = x + eyeOffset;
            eye1Y = y + CONFIG.gridSize - eyeOffset - eyeSize;
            eye2X = x + CONFIG.gridSize - eyeOffset - eyeSize;
            eye2Y = y + CONFIG.gridSize - eyeOffset - eyeSize;
            break;
        case 'left':
            eye1X = x + eyeOffset;
            eye1Y = y + eyeOffset;
            eye2X = x + eyeOffset;
            eye2Y = y + CONFIG.gridSize - eyeOffset - eyeSize;
            break;
        case 'right':
            eye1X = x + CONFIG.gridSize - eyeOffset - eyeSize;
            eye1Y = y + eyeOffset;
            eye2X = x + CONFIG.gridSize - eyeOffset - eyeSize;
            eye2Y = y + CONFIG.gridSize - eyeOffset - eyeSize;
            break;
    }

    ctx.beginPath();
    ctx.arc(eye1X + eyeSize / 2, eye1Y + eyeSize / 2, eyeSize / 2, 0, Math.PI * 2);
    ctx.arc(eye2X + eyeSize / 2, eye2Y + eyeSize / 2, eyeSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(eye1X + eyeSize / 2, eye1Y + eyeSize / 2, 2, 0, Math.PI * 2);
    ctx.arc(eye2X + eyeSize / 2, eye2Y + eyeSize / 2, 2, 0, Math.PI * 2);
    ctx.fill();
};

const drawFood = (currentTime) => {
    if (!gameState.food) return;

    const x = gameState.food.x * CONFIG.gridSize + CONFIG.gridSize / 2;
    const y = gameState.food.y * CONFIG.gridSize + CONFIG.gridSize / 2;
    const baseRadius = CONFIG.gridSize / 2 - 2;

    const pulse = Math.sin(currentTime / 200) * 2;
    const radius = baseRadius + pulse;

    ctx.fillStyle = gameState.food.color;

    if (gameState.food.type === 'golden') {
        ctx.shadowColor = gameState.food.color;
        ctx.shadowBlur = 15;
    } else if (gameState.food.type === 'rainbow') {
        ctx.shadowColor = gameState.food.color;
        ctx.shadowBlur = 20;
    }

    ctx.beginPath();

    if (gameState.food.type === 'normal') {
        ctx.arc(x, y, radius, 0, Math.PI * 2);
    } else if (gameState.food.type === 'golden') {
        for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    } else if (gameState.food.type === 'rainbow') {
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius, y);
        ctx.lineTo(x, y + radius);
        ctx.lineTo(x - radius, y);
        ctx.closePath();
    }

    ctx.fill();
    ctx.shadowBlur = 0;
};

const draw = (currentTime) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawFood(currentTime);
    drawSnake();
    updateParticles();
    drawParticles();
};

const getSpeed = () => {
    const difficultyConfig = CONFIG.difficulty[gameState.difficulty];
    return CONFIG.initialSpeed * difficultyConfig.speedMultiplier -
           Math.min(100, Math.floor(gameState.score / 10) * CONFIG.speedDecrease);
};

const update = () => {
    if (!gameState.isRunning || gameState.isPaused || gameState.isGameOver) return;

    const opposites = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' };

    if (gameState.inputBuffer.length > 0) {
        const nextDir = gameState.inputBuffer.shift();
        if (opposites[nextDir] !== gameState.direction) {
            gameState.direction = nextDir;
        }
        while (gameState.inputBuffer.length > 0) {
            const nextDir = gameState.inputBuffer.shift();
            if (opposites[nextDir] !== gameState.direction) {
                gameState.direction = nextDir;
                break;
            }
        }
    }

    const head = { x: gameState.snake[0].x, y: gameState.snake[0].y };

    switch (gameState.direction) {
        case 'up': head.y--; break;
        case 'down': head.y++; break;
        case 'left': head.x--; break;
        case 'right': head.x++; break;
    }

    if (checkWallCollision(head) || checkSelfCollision()) {
        gameOver();
        return;
    }

    gameState.snake.unshift(head);

    if (gameState.food && head.x === gameState.food.x && head.y === gameState.food.y) {
        const points = gameState.food.points * CONFIG.difficulty[gameState.difficulty].scoreMultiplier;
        gameState.score += Math.floor(points);
        scoreElement.textContent = gameState.score;

        if (gameState.score > gameState.highScore) {
            gameState.highScore = gameState.score;
            highScoreElement.textContent = gameState.highScore;
            Storage.saveHighScore(gameState.highScore);
        }

        playSound(gameState.food.type === 'golden' ? 'golden' : 'eat');
        const foodX = gameState.food.x * CONFIG.gridSize + CONFIG.gridSize / 2;
        const foodY = gameState.food.y * CONFIG.gridSize + CONFIG.gridSize / 2;
        createParticles(foodX, foodY, gameState.food.color);

        if (gameState.score > 0 && gameState.score % 100 === 0) {
            playSound('milestone');
        }

        generateFood();
    } else {
        gameState.snake.pop();
    }
};

const checkWallCollision = (head) => {
    return (
        head.x < 0 ||
        head.x >= canvas.width / CONFIG.gridSize ||
        head.y < 0 ||
        head.y >= canvas.height / CONFIG.gridSize
    );
};

const checkSelfCollision = () => {
    const head = gameState.snake[0];
    for (let i = 1; i < gameState.snake.length; i++) {
        if (head.x === gameState.snake[i].x && head.y === gameState.snake[i].y) {
            return true;
        }
    }
    return false;
};

const gameOver = () => {
    gameState.isGameOver = true;
    gameState.isRunning = false;
    playSound('gameover');
    finalScoreElement.textContent = gameState.score;
    overlayTitle.textContent = 'Game Over';
    gameOverElement.classList.remove('hidden');
    pauseButton.innerHTML = '<span class="btn-icon" aria-hidden="true">⏸️</span><span class="btn-text">Pause</span>';
};

const gameWin = () => {
    gameState.isGameOver = true;
    gameState.isRunning = false;
    playSound('milestone');
    finalScoreElement.textContent = gameState.score;
    overlayTitle.textContent = '🎉 You Win!';
    gameOverElement.classList.remove('hidden');
};

const resetGame = () => {
    gameState.snake = [{ x: 10, y: 10 }];
    gameState.direction = 'right';
    gameState.nextDirection = 'right';
    gameState.inputBuffer = [];
    gameState.score = 0;
    gameState.isGameOver = false;
    gameState.isPaused = false;
    gameState.particles = [];
    scoreElement.textContent = '0';
    gameOverElement.classList.add('hidden');
    generateFood();
};

const startGame = () => {
    resetGame();
    gameState.isRunning = true;
    startOverlayElement.classList.add('hidden');
    gameLoop(0);
};

const togglePause = () => {
    if (!gameState.isRunning || gameState.isGameOver) return;

    gameState.isPaused = !gameState.isPaused;
    playSound('pause');

    if (gameState.isPaused) {
        pauseButton.innerHTML = '<span class="btn-icon" aria-hidden="true">▶️</span><span class="btn-text">Resume</span>';
    } else {
        pauseButton.innerHTML = '<span class="btn-icon" aria-hidden="true">⏸️</span><span class="btn-text">Pause</span>';
    }
};

const handleDirection = (newDirection) => {
    if (!gameState.isRunning || gameState.isPaused || gameState.isGameOver) return;

    const opposites = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' };
    const lastDirection = gameState.inputBuffer.length > 0
        ? gameState.inputBuffer[gameState.inputBuffer.length - 1]
        : gameState.direction;

    if (opposites[newDirection] !== lastDirection && newDirection !== lastDirection) {
        if (gameState.inputBuffer.length < 2) {
            gameState.inputBuffer.push(newDirection);
        }
    }
};

const handleKeyboard = (e) => {
    const keyMap = {
        'ArrowUp': 'up', 'KeyW': 'up',
        'ArrowDown': 'down', 'KeyS': 'down',
        'ArrowLeft': 'left', 'KeyA': 'left',
        'ArrowRight': 'right', 'KeyD': 'right'
    };

    if (keyMap[e.code]) {
        e.preventDefault();
        handleDirection(keyMap[e.code]);
    }

    if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
    }

    if (e.code === 'Enter' && !gameState.isRunning) {
        e.preventDefault();
        startGame();
    }
};

const handleTouchStart = (e) => {
    if (e.touches.length > 0) {
        gameState.touchStartX = e.touches[0].clientX;
        gameState.touchStartY = e.touches[0].clientY;
    }
};

const handleTouchEnd = (e) => {
    if (!gameState.isRunning || gameState.isGameOver || !gameState.touchStartX) return;

    const dx = e.changedTouches[0].clientX - gameState.touchStartX;
    const dy = e.changedTouches[0].clientY - gameState.touchStartY;

    if (Math.abs(dx) > CONFIG.minSwipeDistance) {
        handleDirection(dx > 0 ? 'right' : 'left');
    } else if (Math.abs(dy) > CONFIG.minSwipeDistance) {
        handleDirection(dy > 0 ? 'down' : 'up');
    }

    gameState.touchStartX = null;
    gameState.touchStartY = null;
};

const gameLoop = (currentTime) => {
    if (!gameState.isRunning) return;

    const deltaTime = currentTime - gameState.lastTime;
    gameState.lastTime = currentTime;

    if (!gameState.isPaused) {
        gameState.accumulator += deltaTime;
        const speed = Math.max(CONFIG.minSpeed, getSpeed());

        while (gameState.accumulator >= speed) {
            update();
            gameState.accumulator -= speed;
        }
    }

    draw(currentTime);
    requestAnimationFrame(gameLoop);
};

const toggleTheme = () => {
    gameState.theme = gameState.theme === 'light' ? 'dark' : 'light';
    themeIcon.textContent = gameState.theme === 'light' ? '🌙' : '☀️';
    document.body.setAttribute('data-theme', gameState.theme);
    Storage.saveTheme(gameState.theme);
    clearGradientCache();
};

const handleDifficultyChange = () => {
    gameState.difficulty = difficultySelect.value;
};

const setupDpad = () => {
    document.querySelector('.dpad-up').addEventListener('click', () => handleDirection('up'));
    document.querySelector('.dpad-down').addEventListener('click', () => handleDirection('down'));
    document.querySelector('.dpad-left').addEventListener('click', () => handleDirection('left'));
    document.querySelector('.dpad-right').addEventListener('click', () => handleDirection('right'));
};

const init = () => {
    gameState.highScore = Storage.loadHighScore();
    highScoreElement.textContent = gameState.highScore;

    gameState.theme = Storage.loadTheme();
    themeIcon.textContent = gameState.theme === 'light' ? '🌙' : '☀️';
    document.body.setAttribute('data-theme', gameState.theme);

    difficultySelect.value = gameState.difficulty;

    startButton.addEventListener('click', startGame);
    restartButton.addEventListener('click', startGame);
    pauseButton.addEventListener('click', togglePause);
    themeToggle.addEventListener('click', toggleTheme);
    difficultySelect.addEventListener('change', handleDifficultyChange);

    document.addEventListener('keydown', handleKeyboard);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

    setupDpad();

    generateFood();
    draw(0);
};

init();
