// メインビジュアルのスライダー（矢印・ドット・自動再生）
const track = document.querySelector('.hero__track');
const slides = document.querySelectorAll('.hero__slide');
const dots = document.querySelectorAll('.hero__dots button');
const prevBtn = document.querySelector('.hero__arrow--prev');
const nextBtn = document.querySelector('.hero__arrow--next');

let current = 0;
let timer;

function goTo(index) {
  current = (index + slides.length) % slides.length;
  track.style.transform = `translateX(-${current * 100}%)`;
  dots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
  restart();
}

// 5秒ごとに次のスライドへ
function restart() {
  clearInterval(timer);
  timer = setInterval(() => goTo(current + 1), 5000);
}

prevBtn.addEventListener('click', () => goTo(current - 1));
nextBtn.addEventListener('click', () => goTo(current + 1));
dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

restart();
