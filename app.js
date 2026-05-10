const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "pt-BR", label: "Português (BR)" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "ar-SA", label: "العربية" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "sw-KE", label: "Kiswahili" },
];

const DATA = {
  colors: [
    { key: "red", emoji: "🟥" }, { key: "blue", emoji: "🟦" }, { key: "yellow", emoji: "🟨" },
    { key: "green", emoji: "🟩" }, { key: "orange", emoji: "🟧" }, { key: "purple", emoji: "🟪" },
  ],
  shapes: [
    { key: "circle", emoji: "⚪" }, { key: "square", emoji: "⬜" }, { key: "triangle", emoji: "🔺" },
    { key: "star", emoji: "⭐" }, { key: "heart", emoji: "❤️" }, { key: "diamond", emoji: "🔷" },
  ],
};

const TRANSLATIONS = {
  en: { title: "Choose the correct answer", colors: "Colors", numbers: "Numbers", shapes: "Shapes" },
  es: { title: "Elige la respuesta correcta", colors: "Colores", numbers: "Números", shapes: "Formas" },
  fr: { title: "Choisis la bonne réponse", colors: "Couleurs", numbers: "Nombres", shapes: "Formes" },
  de: { title: "Wähle die richtige Antwort", colors: "Farben", numbers: "Zahlen", shapes: "Formen" },
};

const state = {
  childName: "",
  language: "en-US",
  score: 0,
  round: 0,
  streak: 0,
  difficulty: 1,
  current: null,
};

const el = {
  childName: document.getElementById("childName"),
  languageSelect: document.getElementById("languageSelect"),
  startBtn: document.getElementById("startBtn"),
  status: document.getElementById("status"),
  gameCard: document.getElementById("gameCard"),
  modeBadge: document.getElementById("modeBadge"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  question: document.getElementById("question"),
  promptVisual: document.getElementById("promptVisual"),
  options: document.getElementById("options"),
  speakBtn: document.getElementById("speakBtn"),
  score: document.getElementById("score"),
  round: document.getElementById("round"),
};

function init() {
  LANGUAGES.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = `${lang.label} (${lang.code})`;
    el.languageSelect.appendChild(option);
  });
  el.startBtn.addEventListener("click", startGame);
  el.speakBtn.addEventListener("click", () => speak(state.current?.prompt || ""));
}

function startGame() {
  state.childName = el.childName.value.trim() || "Explorer";
  state.language = el.languageSelect.value;
  state.score = 0;
  state.round = 0;
  state.streak = 0;
  state.difficulty = 1;
  el.gameCard.classList.remove("hidden");
  showStatus(`Welcome ${state.childName}! Let's play.`, "ok");
  nextRound();
}

function nextRound() {
  state.round += 1;
  adaptDifficulty();
  state.current = generateRound();
  renderRound();
}

function adaptDifficulty() {
  if (state.streak >= 4 || state.score >= state.difficulty * 8) state.difficulty += 1;
  state.difficulty = Math.min(state.difficulty, 6);
}

function generateRound() {
  const modes = ["colors", "numbers", "shapes"];
  const mode = modes[Math.floor(Math.random() * modes.length)];

  if (mode === "numbers") {
    const max = 3 + state.difficulty * 2;
    const answer = Math.floor(Math.random() * max) + 1;
    const options = shuffle(unique([answer, randomNum(max), randomNum(max), randomNum(max)])).slice(0, 4);
    return {
      mode,
      prompt: `Tap number ${answer}`,
      visual: "🔢",
      answer,
      options,
    };
  }

  const set = DATA[mode];
  const answer = set[Math.floor(Math.random() * set.length)];
  const options = shuffle(unique([answer, pick(set), pick(set), pick(set)], "key")).slice(0, 4);
  return {
    mode,
    prompt: `Tap ${answer.key}`,
    visual: answer.emoji,
    answer,
    options,
  };
}

function renderRound() {
  const t = getT();
  el.modeBadge.textContent = t[state.current.mode] || state.current.mode;
  el.difficultyBadge.textContent = `Level ${state.difficulty}`;
  el.question.textContent = `${t.title}: ${state.current.prompt}`;
  el.promptVisual.textContent = state.current.visual;
  el.options.innerHTML = "";

  state.current.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = typeof opt === "number" ? opt : `${opt.emoji} ${opt.key}`;
    btn.addEventListener("click", () => checkAnswer(opt, btn));
    el.options.appendChild(btn);
  });

  el.score.textContent = state.score;
  el.round.textContent = state.round;
  speak(state.current.prompt);
}

function checkAnswer(selected, btn) {
  const correct = state.current.mode === "numbers"
    ? selected === state.current.answer
    : selected.key === state.current.answer.key;

  if (correct) {
    state.score += 2 * state.difficulty;
    state.streak += 1;
    btn.classList.add("correct");
    showStatus("Great job! Moving to next challenge…", "ok");
  } else {
    state.score = Math.max(0, state.score - 1);
    state.streak = 0;
    btn.classList.add("wrong");
    showStatus("Nice try! Let's practice another one.", "bad");
  }

  setTimeout(nextRound, 700);
}

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = state.language;
  utterance.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function showStatus(message, type) {
  el.status.classList.remove("hidden");
  el.status.textContent = message;
  el.status.style.borderLeft = `5px solid ${type === "ok" ? "#15803d" : "#b91c1c"}`;
}

function randomNum(max) { return Math.floor(Math.random() * max) + 1; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function unique(arr, key = null) {
  const seen = new Set();
  return arr.filter((item) => {
    const val = key ? item[key] : item;
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}
function getT() {
  const short = state.language.split("-")[0];
  return TRANSLATIONS[short] || TRANSLATIONS.en;
}

init();
