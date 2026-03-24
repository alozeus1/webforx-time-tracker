"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.categorizeWindows = void 0;
const db_1 = __importDefault(require("../config/db"));
const categorizeWindows = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { windowTitles } = req.body;
        if (!windowTitles || !Array.isArray(windowTitles)) {
            res.status(400).json({ message: 'Invalid payload. Provide an array of windowTitles.' });
            return;
        }
        const activeProjects = yield db_1.default.project.findMany({ where: { is_active: true } });
        // Mock ML Logic: fuzzy match words in the titles with project names
        const suggestions = [];
        windowTitles.forEach((title) => {
            let bestMatch = null;
            let highestScore = 0;
            activeProjects.forEach(proj => {
                const words = title.toLowerCase().split(/\s+/);
                let score = 0;
                words.forEach(word => {
                    if (proj.name.toLowerCase().includes(word) && word.length > 3) {
                        score += 0.5;
                    }
                });
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = proj.name;
                }
            });
            suggestions.push({
                title,
                suggested_project: highestScore > 0 ? bestMatch : null,
                confidence: highestScore > 0 ? Math.min(highestScore, 0.99) : 0
            });
        });
        res.status(200).json({ suggestions });
    }
    catch (error) {
        console.error('ML categorizer failed:', error);
        res.status(500).json({ message: 'Internal server error resolving AI categories' });
    }
});
exports.categorizeWindows = categorizeWindows;
