"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDots = addDots;
const DOT = "•";
const MAX_DOTS = 3;
function randomInt(max) {
    return Math.floor(Math.random() * max);
}
function addDots(text) {
    if (text.length === 0)
        return text;
    const textLen = text.length;
    const positions = new Set();
    while (positions.size < MAX_DOTS) {
        positions.add(randomInt(textLen));
    }
    const sortedPositions = Array.from(positions).sort((a, b) => a - b);
    let result = "";
    let prev = 0;
    for (const pos of sortedPositions) {
        result += text.slice(prev, pos);
        result += DOT;
        prev = pos;
    }
    result += text.slice(prev);
    return result;
}
