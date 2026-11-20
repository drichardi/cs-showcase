// Sample sketch for the showcase, laid out like a p5 editor download
// (index.html + sketch.js). Delete once real student work exists.
// Fish scatter from the mouse. Click to drop a stone; space adds a fish.

let fish = [];
let ripples = [];

function setup() {
  createCanvas(600, 400);
  for (let i = 0; i < 40; i++) addFish(random(width), random(height));
  textFont('monospace');
}

function addFish(x, y) {
  fish.push({ x: x, y: y, a: random(TWO_PI), speed: random(1.2, 2.2), boost: 0 });
}

// Turn angle a toward target by a fraction, the short way round.
function turnToward(a, target, amount) {
  let diff = atan2(sin(target - a), cos(target - a));
  return a + diff * amount;
}

function draw() {
  background(14, 36, 58);

  noFill();
  strokeWeight(2);
  for (let r of ripples) {
    stroke(120, 190, 230, 255 * (1 - r.t));
    circle(r.x, r.y, r.t * 180);
    r.t += 0.02;
  }
  ripples = ripples.filter(r => r.t < 1);

  for (let f of fish) {
    let near = dist(f.x, f.y, mouseX, mouseY) < 90;
    if (near) {
      f.a = turnToward(f.a, atan2(f.y - mouseY, f.x - mouseX), 0.25);
    } else {
      f.a += random(-0.08, 0.08);
    }
    let v = f.speed + f.boost;
    f.x = (f.x + cos(f.a) * v + width) % width;
    f.y = (f.y + sin(f.a) * v + height) % height;
    f.boost *= 0.95;

    push();
    translate(f.x, f.y);
    rotate(f.a);
    noStroke();
    fill(near ? color(242, 160, 90) : color(242, 229, 200));
    ellipse(0, 0, 16, 7);
    triangle(-7, 0, -13, -5, -13, 5);
    pop();
  }

  noStroke();
  fill(255, 255, 255, 110);
  textSize(10);
  text('SAMPLE · p5.js · move the mouse · click · space', 10, height - 10);
}

function mousePressed() {
  ripples.push({ x: mouseX, y: mouseY, t: 0 });
  for (let f of fish) {
    if (dist(f.x, f.y, mouseX, mouseY) < 160) {
      f.a = atan2(f.y - mouseY, f.x - mouseX);
      f.boost = 5;
    }
  }
}

function keyPressed() {
  if (key === ' ') {
    addFish(mouseX, mouseY);
    return false;  // don't scroll the page
  }
}
