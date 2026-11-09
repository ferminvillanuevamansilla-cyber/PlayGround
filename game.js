const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hpValue = document.getElementById('hpValue');
const spiritValue = document.getElementById('spiritValue');
const coinValue = document.getElementById('coinValue');
const teamList = document.getElementById('teamList');
const objective = document.getElementById('objective');
const messageBox = document.getElementById('messageBox');
const battlePanel = document.getElementById('battlePanel');
const battleTitle = document.getElementById('battleTitle');
const battleEmoji = document.getElementById('battleEmoji');
const battleName = document.getElementById('battleName');
const battleHp = document.getElementById('battleHp');

const keys = {};
const world = {
  width: 900,
  height: 560,
};

const player = {
  x: 120,
  y: 170,
  radius: 16,
  speed: 190,
  hp: 100,
  spirit: 100,
  coins: 0,
  facing: 'down',
  captured: [],
};

const yoKaiPool = [
  { name: 'Mochi', emoji: '👻', hp: 26, spirit: 18, color: '#b9d9ff', reward: 12 },
  { name: 'Baku', emoji: '🐼', hp: 30, spirit: 15, color: '#a8f7d1', reward: 15 },
  { name: 'Koma', emoji: '🦊', hp: 20, spirit: 22, color: '#ffd79b', reward: 10 },
  { name: 'Paws', emoji: '🐱', hp: 35, spirit: 12, color: '#ffb7d5', reward: 18 },
  { name: 'Jibanyan', emoji: '😺', hp: 40, spirit: 17, color: '#ffdb94', reward: 22 },
];

const yoKaiInWorld = [
  { ...yoKaiPool[0], x: 310, y: 220, active: true },
  { ...yoKaiPool[1], x: 560, y: 260, active: true },
  { ...yoKaiPool[2], x: 660, y: 110, active: true },
  { ...yoKaiPool[3], x: 220, y: 420, active: true },
  { ...yoKaiPool[4], x: 760, y: 390, active: true },
];

const interactables = [
  { type: 'shop', x: 705, y: 225, w: 90, h: 58, label: 'Tienda de amuletos', shop: true },
  { type: 'gate', x: 625, y: 470, w: 110, h: 48, label: 'Puerta del barrio', portal: true },
  { type: 'tree', x: 80, y: 310, w: 90, h: 64, label: 'Arbol de la noche', heal: true },
];

const battleState = {
  active: false,
  yoKai: null,
  currentHp: 0,
  turn: 0,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function showMessage(text) {
  messageBox.textContent = text;
}

function updateHUD() {
  hpValue.textContent = Math.max(0, player.hp);
  spiritValue.textContent = Math.max(0, player.spirit);
  coinValue.textContent = player.coins;

  const entries = [
    { name: 'Jibanyan', caught: true },
    ...player.captured.map((name) => ({ name, caught: true })),
  ];

  teamList.innerHTML = '';
  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${entry.name}</span><span class="${entry.caught ? 'captured' : ''}">${entry.caught ? 'Listo' : 'Vacío'}</span>`;
    teamList.appendChild(li);
  });

  objective.textContent = player.captured.length >= 3
    ? '¡Has reunido a los espíritus de la luna!'
    : 'Atrápalos a todos antes de que la luna se esconda.';
}

function resetBattle(yoKai) {
  battleState.active = true;
  battleState.yoKai = yoKai;
  battleState.currentHp = yoKai.hp;
  battleState.turn = 1;
  battlePanel.classList.remove('hidden');
  battleTitle.textContent = 'Batalla contra ' + yoKai.name;
  battleEmoji.textContent = yoKai.emoji;
  battleName.textContent = yoKai.name;
  battleHp.textContent = 'HP: ' + battleState.currentHp;
  showMessage(`${yoKai.name} ha aparecido. Usa tus habilidades para capturarlo.`);
}

function endBattle(result) {
  const yoKai = battleState.yoKai;
  if (!yoKai) return;

  if (result === 'caught') {
    player.captured.push(yoKai.name);
    player.coins += yoKai.reward;
    showMessage(`${yoKai.name} se une a tu equipo. +${yoKai.reward} monedas.`);
  } else if (result === 'escaped') {
    showMessage(`${yoKai.name} ha huido a la noche.`);
  } else {
    player.hp = 35;
    player.spirit = 50;
    player.x = 120;
    player.y = 170;
    showMessage('Te han debilitado. Has vuelto a casa; busca un árbol para curarte.');
  }

  const index = yoKaiInWorld.findIndex((entry) => entry.name === yoKai.name && !player.captured.includes(entry.name));
  if (index >= 0) {
    yoKaiInWorld[index].active = false;
  }

  battleState.active = false;
  battleState.yoKai = null;
  battlePanel.classList.add('hidden');
  updateHUD();
}

function performBattleAction(action) {
  if (!battleState.active || !battleState.yoKai) return;

  const yoKai = battleState.yoKai;
  const currentTurn = battleState.turn;

  if (action === 'run') {
    endBattle('escaped');
    return;
  }

  if (action === 'attack') {
    battleState.currentHp -= 12 + Math.floor(Math.random() * 8);
    showMessage(`${yoKai.name} recibe un golpe con talón de espíritu.`);
  } else if (action === 'spirit') {
    if (player.spirit < 10) {
      showMessage('No tienes suficiente espíritu. Usa Curar o ataca.');
      return;
    }
    const dmg = 15 + Math.floor(Math.random() * 10);
    battleState.currentHp -= dmg;
    player.spirit = clamp(player.spirit - 10, 0, 100);
    showMessage(`${yoKai.name} se ve afectado por el poder del espíritu.`);
  } else if (action === 'friend') {
    const healthRatio = Math.max(0, battleState.currentHp) / yoKai.hp;
    const chance = 0.35 + (1 - healthRatio) * 0.65;
    if (Math.random() < chance) {
      endBattle('caught');
      return;
    }
    showMessage(`Aún no confía en ti (${Math.round(chance * 100)}%). ¡Debilítalo un poco más!`);
  } else if (action === 'heal') {
    player.hp = clamp(player.hp + 16, 0, 100);
    player.spirit = clamp(player.spirit + 8, 0, 100);
    showMessage('Te curas con una pequeña energía lunar.');
  } else {
    return;
  }

  battleState.turn += 1;
  battleHp.textContent = 'HP: ' + Math.max(0, battleState.currentHp);

  if (battleState.currentHp <= 0) {
    endBattle('caught');
    return;
  }

  const opponentAttack = 6 + Math.floor(Math.random() * 12);
  player.hp = clamp(player.hp - opponentAttack, 0, 100);
  updateHUD();

  if (player.hp <= 0) {
    endBattle('lost');
    return;
  }

  showMessage(`Turno ${currentTurn}: ${yoKai.name} contraataca por ${opponentAttack}.`);
}

function findNearbyYoKai() {
  return yoKaiInWorld.find((yoKai) => yoKai.active && Math.hypot(player.x - yoKai.x, player.y - yoKai.y) < 42);
}

function checkInteraction() {
  if (battleState.active) return;

  const nearby = findNearbyYoKai();
  if (nearby) {
    resetBattle(nearby);
    return;
  }

  const interactable = interactables.find((obj) =>
    player.x + player.radius > obj.x &&
    player.x - player.radius < obj.x + obj.w &&
    player.y + player.radius > obj.y &&
    player.y - player.radius < obj.y + obj.h
  );

  if (interactable) {
    if (interactable.shop) {
      player.coins += 5;
      showMessage('La tienda de amuletos te regala 5 monedas de la luna.');
      updateHUD();
    }

    if (interactable.heal) {
      player.hp = clamp(player.hp + 20, 0, 100);
      player.spirit = clamp(player.spirit + 25, 0, 100);
      showMessage('El árbol te devuelve energía.');
      updateHUD();
    }

    if (interactable.portal) {
      const winState = player.captured.length >= 3;
      showMessage(winState
        ? '¡La puerta del barrio se abre! Has completado la misión.'
        : 'La puerta permanece cerrada. Aún faltan espíritus por capturar.');
    }
  }
}

function drawBackground() {
  ctx.clearRect(0, 0, world.width, world.height);

  const sky = ctx.createLinearGradient(0, 0, 0, world.height);
  sky.addColorStop(0, '#2b325a');
  sky.addColorStop(0.7, '#192541');
  sky.addColorStop(1, '#0f1527');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.fillStyle = '#7abdff';
  ctx.beginPath();
  ctx.arc(760, 95, 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f7d885';
  ctx.fillRect(0, 360, world.width, 220);

  ctx.fillStyle = '#4f8a5d';
  ctx.fillRect(0, 350, world.width, 30);

  ctx.fillStyle = '#7a573a';
  ctx.fillRect(250, 175, 120, 140);
  ctx.fillRect(460, 90, 170, 190);
  ctx.fillRect(685, 220, 110, 140);

  ctx.fillStyle = '#d9bb7f';
  ctx.fillRect(290, 200, 40, 115);
  ctx.fillRect(515, 120, 40, 150);
  ctx.fillRect(720, 245, 50, 110);

  ctx.fillStyle = '#e7e6f3';
  ctx.fillRect(30, 390, 100, 70);
  ctx.fillRect(150, 400, 90, 60);
  ctx.fillRect(610, 420, 130, 70);

  for (const object of interactables) {
    ctx.fillStyle = object.shop ? '#d39dff' : object.heal ? '#90f5a8' : '#f1d67d';
    ctx.fillRect(object.x, object.y, object.w, object.h);
  }
}

function drawYoKai() {
  for (const yoKai of yoKaiInWorld) {
    if (!yoKai.active) continue;
    ctx.fillStyle = yoKai.color;
    ctx.beginPath();
    ctx.arc(yoKai.x, yoKai.y, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(yoKai.emoji, yoKai.x, yoKai.y + 7);

    ctx.fillStyle = '#1f2937';
    ctx.fillRect(yoKai.x - 22, yoKai.y - 30, 44, 6);
    ctx.fillStyle = '#7ef0a1';
    ctx.fillRect(yoKai.x - 22, yoKai.y - 30, 44 * (yoKai.hp / 40), 6);
  }
}

function drawPlayer() {
  const shade = player.facing === 'up' ? '#70d7ff' : player.facing === 'left' ? '#9fd9ff' : '#e9ebff';
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0e1b2f';
  ctx.fillRect(player.x - 6, player.y - 12, 12, 18);
}

function updatePlayer(delta) {
  let dx = 0;
  let dy = 0;

  if (keys['w'] || keys['arrowup']) { dy -= 1; player.facing = 'up'; }
  if (keys['s'] || keys['arrowdown']) { dy += 1; player.facing = 'down'; }
  if (keys['a'] || keys['arrowleft']) { dx -= 1; player.facing = 'left'; }
  if (keys['d'] || keys['arrowright']) { dx += 1; player.facing = 'right'; }

  const length = Math.hypot(dx, dy) || 1;
  dx /= length;
  dy /= length;

  player.x = clamp(player.x + dx * player.speed * delta, 20, world.width - 20);
  player.y = clamp(player.y + dy * player.speed * delta, 20, world.height - 20);
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
    event.preventDefault();
  }
  keys[key] = true;
  if (key === 'e' && !event.repeat) checkInteraction();
}

function handleKeyup(event) {
  keys[event.key.toLowerCase()] = false;
}

function bindTouchControls() {
  document.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      keys[key] = true;
      button.setPointerCapture(event.pointerId);
    });
    const release = (event) => {
      event.preventDefault();
      keys[key] = false;
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', () => { keys[key] = false; });
  });

  document.getElementById('interactTouch').addEventListener('click', checkInteraction);
  window.addEventListener('blur', () => {
    Object.keys(keys).forEach((key) => { keys[key] = false; });
  });
}

function bindBattleButtons() {
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      performBattleAction(button.dataset.action);
    });
  });
}

let lastTime = 0;
function gameLoop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.033);
  lastTime = timestamp;

  if (!battleState.active) {
    updatePlayer(delta);
  }

  drawBackground();
  drawYoKai();
  drawPlayer();
  requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', handleKeydown);
window.addEventListener('keyup', handleKeyup);
bindTouchControls();
bindBattleButtons();
updateHUD();
requestAnimationFrame(gameLoop);
