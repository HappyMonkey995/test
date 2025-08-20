// Smooth scroll for internal links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelector(this.getAttribute('href')).scrollIntoView({
      behavior: 'smooth'
    });
  });
});

// Floating shape animation (optional extra subtle movement)
const shapes = document.querySelectorAll('.shape');
shapes.forEach((shape, i) => {
  let angle = Math.random() * 360;
  let speed = Math.random() * 0.02 + 0.01;
  function move() {
    angle += speed;
    shape.style.transform = `translateY(${Math.sin(angle) * 20}px) translateX(${Math.cos(angle) * 20}px)`;
    requestAnimationFrame(move);
  }
  move();
});
